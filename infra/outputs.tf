output "server_ip" {
  description = "Public IPv4 address of the server"
  value       = hcloud_server.clustec.ipv4_address
}

output "ssh_command" {
  description = "SSH command to connect to the server"
  value       = "ssh root@${hcloud_server.clustec.ipv4_address}"
}

output "deploy_command" {
  description = "Deploy command using the existing deploy.sh script"
  value       = "../deploy.sh --host ${hcloud_server.clustec.ipv4_address} --platform linux/${var.server_type == "cax11" || var.server_type == "cax21" || var.server_type == "cax31" || var.server_type == "cax41" ? "arm64" : "amd64"}"
}

output "web_url" {
  description = "URL to access the web UI"
  value       = var.domain != "" ? "https://${var.domain}" : "http://${hcloud_server.clustec.ipv4_address}"
}

output "dns_record" {
  description = "DNS A record to create for your domain"
  value       = var.domain != "" ? "${var.domain} → A → ${hcloud_server.clustec.ipv4_address}" : "n/a (no domain set)"
}

output "postgres_password" {
  description = "Generated Postgres password"
  value       = random_password.postgres.result
  sensitive   = true
}
