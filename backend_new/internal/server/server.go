package server

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"log"
	"os"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"gorm.io/gorm"

	"github.com/securechat/backend/internal/api"
	"github.com/securechat/backend/internal/config"
	"github.com/securechat/backend/internal/services"
)

type Server struct {
	cfg *config.Config
	app *fiber.App
	db  *gorm.DB
	api *api.App
}

func NewServer(cfg *config.Config, db *gorm.DB, otpSvc *services.OTPService, prekeySvc *services.PreKeyService, matchmaker *services.Matchmaker, hub *services.Hub) *Server {
	// load RSA priv
	privBytes, err := os.ReadFile(cfg.ServerRSAPrivPath)
	if err != nil {
		log.Fatal("load rsa priv:", err)
	}
	block, _ := pem.Decode(privBytes)
	if block == nil {
		log.Fatal("invalid rsa pem")
	}
	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		log.Fatal("parse rsa:", err)
	}

	app := fiber.New(fiber.Config{
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			if e, ok := err.(*fiber.Error); ok {
				code = e.Code
			}
			return c.Status(code).JSON(fiber.Map{"error": err.Error()})
		},
	})

	// Middleware stack
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     "http://localhost:5173,http://localhost:3000,http://localhost:3001",
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: true,
	}))
	app.Use(limiter.New(limiter.Config{
		Max:        cfg.RateLimitRequests,
		Expiration: time.Duration(cfg.RateLimitWindowSec) * time.Second,
	}))

	a := &api.App{
		DB:         db,
		OTPService: otpSvc,
		PreKeySvc:  prekeySvc,
		Matchmaker: matchmaker,
		Hub:        hub,
		ServerPriv: key,
		Cfg:        cfg,
	}

	s := &Server{cfg: cfg, app: app, db: db, api: a}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	// Public routes
	s.app.Post("/auth/register", s.api.RegisterHandler)
	s.app.Post("/auth/verify-2fa", s.api.Verify2FAHandler)
	s.app.Get("/auth/server-pubkey", s.api.ServerPublicKeyHandler)
	s.app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":    "ok",
			"timestamp": time.Now().Unix(),
		})
	})

	// Protected routes
	api := s.app.Group("/api", s.api.AuthMiddleware)
	api.Post("/keys/prekeys/upload", s.api.PreKeysUploadHandler)
	api.Post("/match/enqueue", s.api.EnqueueMatchHandler)
	api.Get("/match/status", s.api.MatchStatusHandler)
	api.Get("/keys/bundle/:user_id", s.api.GetKeyBundleHandler)
	api.Get("/ws", s.api.WebSocketHandler)
}

func (s *Server) Start() error {
	if s.cfg.TLSCertPath != "" && s.cfg.TLSKeyPath != "" {
		return s.app.ListenTLS(":"+s.cfg.Port, s.cfg.TLSCertPath, s.cfg.TLSKeyPath)
	}
	return s.app.Listen(":" + s.cfg.Port)
}

func (s *Server) Shutdown(ctx context.Context) error {
	log.Println("shutting down server...")

	// Shutdown fiber app
	if err := s.app.ShutdownWithContext(ctx); err != nil {
		log.Printf("fiber shutdown error: %v", err)
	}

	// Close database connections
	sqlDB, err := s.db.DB()
	if err == nil {
		if err := sqlDB.Close(); err != nil {
			log.Printf("db close error: %v", err)
		}
	}

	log.Println("server shutdown complete")
	return nil
}
