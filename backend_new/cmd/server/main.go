package main

import (
    "context"
    "log"
    "os"
    "os/signal"
    "time"

    "github.com/securechat/backend/internal/config"
    "github.com/securechat/backend/internal/db"
    "github.com/securechat/backend/internal/server"
    "github.com/securechat/backend/internal/services"
)

func main() {
    cfg := config.Load()
    logger := log.New(os.Stdout, "", log.LstdFlags)
    logger.Println("starting secure-chat backend")

    gormDB, err := db.Connect(cfg.DatabaseDSN)
    if err != nil {
        logger.Fatal("db connect:", err)
    }

    // initialize services
    otpSvc := services.NewOTPService(gormDB, cfg)
    prekeySvc := services.NewPreKeyService(gormDB)
    matchmaker := services.NewMatchmaker(gormDB)
    hub := services.NewHub()

    srv := server.NewServer(cfg, gormDB, otpSvc, prekeySvc, matchmaker, hub)

    // start matchmaker runner
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()
    go matchmaker.Run(ctx)

    // run server
    go func() {
        if err := srv.Start(); err != nil {
            logger.Fatal("server start:", err)
        }
    }()

    // graceful shutdown
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt)
    <-stop

    logger.Println("shutdown signal received")
    ctxShutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    if err := srv.Shutdown(ctxShutdown); err != nil {
        logger.Fatal("shutdown error:", err)
    }
    logger.Println("server stopped")
}
