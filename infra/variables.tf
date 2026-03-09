variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "server_type" {
  description = "Hetzner server type (e.g. cax11 = 2 ARM vCPU, 4GB RAM, ~$4/mo)"
  type        = string
  default     = "cax11"
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "fsn1" # Falkenstein, Germany
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key for server access"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "network" {
  description = "Aztec network to index (devnet, nextnet, local)"
  type        = string
  default     = "devnet"
}

variable "domain" {
  description = "Domain name for the server (used for Let's Encrypt TLS)"
  type        = string
  default     = "clustec.xyz"
}
