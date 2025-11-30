package server

import (
    "github.com/gofiber/fiber/v2"
)

func Start() error {
    app := fiber.New()

    // TODO: Add routes
    app.Get("/health", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"status":"ok"})
    })

    return app.Listen(":8080")
}
