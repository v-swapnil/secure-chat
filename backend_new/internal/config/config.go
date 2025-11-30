package config

import (
    "log"
    "os"
    "strconv"

    "github.com/joho/godotenv"
)

type Config struct {
    Port                string
    DatabaseDSN         string
    ServerRSAPrivPath   string
    JWTSigningKey       string
    OTPExpiryMinutes    int
    RateLimitRequests   int
    RateLimitWindowSec  int
    TLSCertPath         string
    TLSKeyPath          string
}

func Load() *Config {
    _ = godotenv.Load()

    cfg := &Config{
        Port:              getEnv("PORT", "8080"),
        DatabaseDSN:       getEnv("DATABASE_DSN", "host=postgres user=appuser password=example dbname=secure_chat sslmode=disable"),
        ServerRSAPrivPath: getEnv("SERVER_RSA_PRIV_PATH", "/secrets/server_rsa_priv.pem"),
        JWTSigningKey:     getEnv("JWT_SIGNING_KEY", "change_this_secret"),
        OTPExpiryMinutes:  getEnvInt("OTP_EXPIRY_MINUTES", 10),
        RateLimitRequests: getEnvInt("RATE_LIMIT_REQUESTS", 10),
        RateLimitWindowSec: getEnvInt("RATE_LIMIT_WINDOW_SECONDS", 60),
        TLSCertPath:       getEnv("TLS_CERT_PATH", ""),
        TLSKeyPath:        getEnv("TLS_KEY_PATH", ""),
    }

    if cfg.JWTSigningKey == "change_this_secret" {
        log.Println("WARNING: using default JWT signing key; replace in production")
    }
    return cfg
}

func getEnv(key, def string) string {
    v := os.Getenv(key)
    if v == "" {
        return def
    }
    return v
}

func getEnvInt(key string, def int) int {
    v := os.Getenv(key)
    if v == "" {
        return def
    }
    if x, err := strconv.Atoi(v); err == nil {
        return x
    }
    return def
}
