// Package sender ships metric snapshots to the Vigil API over HTTP.
package sender

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/damiantrajkovski/vigil-agent/collector"
)

// Client sends metric snapshots to a Vigil API instance.
type Client struct {
	apiURL   string
	agentKey string
	http     *http.Client
}

// New creates a sender Client. apiURL is the Vigil API base URL (no trailing slash).
func New(apiURL, agentKey string) *Client {
	return &Client{
		apiURL:   apiURL,
		agentKey: agentKey,
		http: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Send ships a MetricSnapshot to POST /metrics.
// Returns an error if the request fails or the API returns a non-2xx status.
func (c *Client) Send(snap *collector.MetricSnapshot) error {
	body, err := json.Marshal(snap)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, c.apiURL+"/metrics", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	// Agent authenticates via a bearer token issued during registration
	req.Header.Set("Authorization", "Bearer "+c.agentKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("http send: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("api returned %d", resp.StatusCode)
	}

	return nil
}

// RegisterPayload is sent to POST /servers/register on agent first run.
type RegisterPayload struct {
	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Secret   string `json:"secret"`
}

// RegisterResponse is returned by the API on successful registration.
type RegisterResponse struct {
	AgentKey string `json:"agent_key"`
	ServerID string `json:"server_id"`
}

// Register calls POST /servers/register and returns the issued agent key.
// secret is the API_SECRET configured on the server side.
func Register(apiURL, serverName, hostname, secret string) (*RegisterResponse, error) {
	payload := RegisterPayload{Name: serverName, Hostname: hostname, Secret: secret}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(apiURL+"/servers/register", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("register request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("register returned %d — check API_SECRET", resp.StatusCode)
	}

	var result RegisterResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}
