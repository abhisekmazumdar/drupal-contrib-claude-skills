---
name: ddev-expert
description: >
  DDEV local development expertise. Use when working with DDEV projects, containers, configuration, or troubleshooting DDEV environments.
---

# DDEV Development Expert

You are an expert in DDEV, the Docker-based local development environment for PHP projects.

## When to Use This Skill

**Invoke for:** Starting/stopping containers, running Drush/Composer via DDEV, configuring `.ddev/`, debugging container issues, Xdebug setup, database imports/snapshots, and ANY task that involves running `composer` in a project.

**Do not invoke for:** Pure Drupal PHP or module logic work that has no environment dependency.

## Critical Rules

- **Always use `ddev composer` instead of bare `composer`** for all Drupal projects. Never run `composer` directly on the host.
- **Always use `ddev drush`** instead of bare `drush` for Drupal projects.
- All Drupal projects live under `/Users/horus/Code/drupal-projects/`
- Always `cd` to the project root before running DDEV commands.

**Note:** Drush is NOT included by default - you must `composer require drush/drush` after creating a Drupal project.

## Essential Commands

### Project Management
```bash
ddev start          # Start project containers
ddev stop           # Stop project containers
ddev restart        # Restart containers
ddev poweroff       # Stop all DDEV projects
ddev delete         # Remove project (keeps files)
```

### Executing Commands
```bash
ddev drush <cmd>    # Run Drush commands
ddev composer <cmd> # Run Composer
ddev php <script>   # Run PHP scripts
ddev exec <cmd>     # Run any command in web container
ddev ssh            # SSH into web container
```

### Utilities
```bash
ddev describe       # Show project info and URLs
ddev logs           # View container logs
ddev launch         # Open site in browser
ddev share          # Create public URL (ngrok)
```

## Configuration

### .ddev/config.yaml
```yaml
name: my-project
type: drupal           # Auto-detects Drupal version, or use drupal11/drupal10
docroot: web
php_version: "8.3"     # Use 8.3 for Drupal 11, 8.2 for Drupal 10
webserver_type: nginx-fpm
database:
  type: mariadb
  version: "10.11"

# Additional hostnames
additional_hostnames:
  - api.my-project.ddev.site

# Extra PHP packages
webimage_extra_packages: [php8.3-imagick]
```

### Common Customizations

**Custom services** (.ddev/docker-compose.*.yaml):
```yaml
version: '3.6'
services:
  redis:
    image: redis:7
    container_name: ddev-${DDEV_SITENAME}-redis
    labels:
      com.ddev.site-name: ${DDEV_SITENAME}
    expose:
      - "6379"
```

**PHP overrides** (.ddev/php/my-settings.ini):
```ini
memory_limit = 512M
upload_max_filesize = 64M
post_max_size = 64M
```

## Drupal-Specific Setup

### New Drupal 11 Project
```bash
mkdir my-drupal && cd my-drupal
ddev config --project-type=drupal --docroot=web --php-version=8.3
ddev start
ddev composer create-project drupal/recommended-project:^11
ddev composer require drush/drush
ddev drush site:install --account-name=admin --account-pass=admin -y
ddev launch
```

**Important notes:**
- `ddev composer create-project` requires a clean directory — see Troubleshooting below if it fails with "not allowed to be present"
- Drush is NOT included in Drupal 11's recommended-project - always install it separately
- Use `--project-type=drupal` (auto-detects version) or explicitly `drupal11`

### Existing Drupal Project
```bash
cd existing-project
ddev config --project-type=drupal --docroot=web
ddev start
ddev composer install
ddev import-db --file=database.sql.gz
ddev drush cr
```

## Troubleshooting

### Common Issues

**`ddev composer create-project` fails with "not allowed to be present":**
```bash
# This happens when extra directories exist (like .claude/, .git/, etc.)
# Solution: Move them out temporarily
mv .claude /tmp/claude-backup
mv .git /tmp/git-backup
ddev composer create-project drupal/recommended-project:^11
mv /tmp/claude-backup .claude
mv /tmp/git-backup .git
```

**Port conflicts:**
```bash
ddev poweroff
# Check what's using ports 80/443
sudo lsof -i :80
```

**Container issues:**
```bash
ddev restart
ddev debug refresh    # Rebuild containers
ddev delete && ddev start  # Nuclear option
```

**Database connection issues:**
- Host: `db` (inside container) or `127.0.0.1:PORT` (outside)
- Check port with `ddev describe`

**Permission issues:**
```bash
ddev exec chown -R $(id -u):$(id -g) .
```

### Useful Debug Commands
```bash
ddev debug capabilities  # Show DDEV capabilities
ddev debug router       # Show router status
ddev logs -f            # Follow logs
ddev exec env           # Show environment variables
```

## Xdebug Configuration

### Enable Xdebug
```bash
ddev xdebug on           # Enable step debugging
ddev xdebug off          # Disable (faster performance)
ddev xdebug status       # Check current state
```

### Xdebug Modes
```bash
# .ddev/php/xdebug.ini
[xdebug]
xdebug.mode=debug,develop,coverage
```

Modes: `debug` (step debugging), `develop` (enhanced errors), `coverage` (code coverage), `profile` (profiling)
