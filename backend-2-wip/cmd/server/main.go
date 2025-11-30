package main

import (
    "log"
    "securechat/internal/server"
)

func main() {
    if err := server.Start(); err != nil {
        log.Fatal(err)
    }
}
