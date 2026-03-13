provider "hcloud" {
  token = var.hcloud_token
}

# ── SSH Key ──────────────────────────────────────────────────────────

resource "hcloud_ssh_key" "clustec" {
  name       = "clustec-deploy"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

# ── Random password for Postgres ─────────────────────────────────────

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 32
  special = false
}

# ── Firewall ─────────────────────────────────────────────────────────

resource "hcloud_firewall" "clustec" {
  name = "clustec"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# ── Server ───────────────────────────────────────────────────────────

resource "hcloud_server" "clustec" {
  name        = "clustec"
  server_type = var.server_type
  location    = var.location
  image       = "ubuntu-24.04"

  ssh_keys    = [hcloud_ssh_key.clustec.id]
  firewall_ids = [hcloud_firewall.clustec.id]

  user_data = templatefile("${path.module}/cloud-init.yml", {
    postgres_password = random_password.postgres.result
    jwt_secret        = random_password.jwt_secret.result
    admin_password    = var.admin_password
    network           = var.network
    domain            = var.domain
  })

  labels = {
    project = "clustec"
  }

  lifecycle {
    ignore_changes = [user_data]
  }
}
