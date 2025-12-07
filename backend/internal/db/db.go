package db

import (
	"log"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/securechat/backend/internal/models"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(25)
	sqlDB.SetConnMaxLifetime(5 * time.Minute)

	if err := db.AutoMigrate(
		&models.User{},
		&models.Device{},
		&models.PreKey{},
		&models.OneTimePreKey{},
		&models.RegistrationSession{},
		&models.MatchProfile{},
	); err != nil {
		log.Printf("auto migrate error: %v", err)
		return nil, err
	}
	return db, nil
}
