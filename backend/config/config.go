package config

import "os"

type Config struct {
	AlpacaAPIKey    string
	AlpacaAPISecret string
	AlpacaBaseURL   string
	Port            string
	AllowedOrigins  string
}

func Load() *Config {
	return &Config{
		AlpacaAPIKey:    getEnv("ALPACA_API_KEY", ""),
		AlpacaAPISecret: getEnv("ALPACA_API_SECRET", ""),
		AlpacaBaseURL:   getEnv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets"),
		Port:            getEnv("PORT", "8080"),
		AllowedOrigins:  getEnv("ALLOWED_ORIGINS", "http://localhost:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
