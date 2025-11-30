package utils

import (
    "crypto/rand"
    "crypto/rsa"
    "crypto/sha256"
    "crypto/x509"
    "encoding/pem"
    "errors"
    "io/ioutil"

    "crypto/ed25519"
)

// Load RSA priv key from PEM
func LoadRSAPrivateKey(path string) (*rsa.PrivateKey, error) {
    b, err := ioutil.ReadFile(path)
    if err != nil { return nil, err }
    block, _ := pem.Decode(b)
    if block == nil { return nil, errors.New("invalid pem") }
    key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
    return key, err
}

// Decrypt envelope created with RSA-OAEP SHA256
func RSADecrypt(priv *rsa.PrivateKey, ciphertext []byte) ([]byte, error) {
    label := []byte("")
    return rsa.DecryptOAEP(sha256.New(), rand.Reader, priv, ciphertext, label)
}

// Verify Ed25519 signature
func VerifyEd25519(pub []byte, message []byte, sig []byte) bool {
    if len(pub) != ed25519.PublicKeySize { return false }
    if len(sig) != ed25519.SignatureSize { return false }
    return ed25519.Verify(ed25519.PublicKey(pub), message, sig)
}
