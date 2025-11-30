package server

import (
    "context"
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"
    "io/ioutil"
    "log"
    "net/http"
    "time"

    "github.com/gofiber/fiber/v2"
    "gorm.io/gorm"

    "github.com/securechat/backend/internal/config"
    "github.com/securechat/backend/internal/api"
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
    privBytes, err := ioutil.ReadFile(cfg.ServerRSAPrivPath)
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

    app := fiber.New()
    a := &api.App{
        DB: db,
        OTPService: otpSvc,
        PreKeySvc: prekeySvc,
        Matchmaker: matchmaker,
        Hub: hub,
        ServerPriv: key,
    }

    s := &Server{cfg: cfg, app: app, db: db, api: a}
    s.registerRoutes()
    return s
}

func (s *Server) registerRoutes() {
    s.app.Post("/auth/register", s.api.RegisterHandler)
    s.app.Post("/auth/verify-2fa", s.api.Verify2FAHandler)
    s.app.Post("/keys/prekeys/upload", s.api.PreKeysUploadHandler)
    s.app.Get("/health", func(c *fiber.Ctx) error { return c.SendString("ok") })
    // TODO: add match endpoints and ws
}

func (s *Server) Start() error {
    if s.cfg.TLSCertPath != "" && s.cfg.TLSKeyPath != "" {
        return s.app.ListenTLS(":"+s.cfg.Port, s.cfg.TLSCertPath, s.cfg.TLSKeyPath)
    }
    return s.app.Listen(":"+s.cfg.Port)
}

func (s *Server) Shutdown(ctx context.Context) error {
    _ = s.app.Shutdown()
    return nil
}
