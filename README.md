# LCMS Core

## Curriculum Architecture

The curriculum follows a hierarchical structure:

**Unit → Section → Lesson → Activity**

- **Unit** — top-level curriculum grouping. Represented by a `Resource` model.
- **Section** — a subdivision within a unit. Represented by a `Resource` model.
- **Lesson** — an individual lesson within a section. Represented by a `Resource` model and has an associated `Document` model.
- **Activity** — a part of a lesson. Has no dedicated database model.

**Materials** are standalone objects that can be attached to lessons as supporting content (PDFs, worksheets, etc.).

## Development

### Prerequisites

- Docker and Docker Compose

### Quick Start

```bash
# 1. Build the Docker image
docker build -f Dockerfile.dev -t lcms-core:dev .

# 2. Start database and Redis
docker compose up -d db redis

# 3. Create PostgreSQL extensions and database
docker compose exec db sh -c "psql -U postgres -d template1 -c 'CREATE EXTENSION IF NOT EXISTS hstore;'"
docker compose exec db sh -c "psql -U postgres -c 'CREATE DATABASE lcms;'"

# 4. Install dependencies
docker compose run --rm rails bundle install
docker compose run --rm rails yarn install

# 5. Setup database
docker compose run --rm rails rails db:migrate
docker compose run --rm rails rails db:seed

# 6. Start all services
docker compose up
```

The application will be available at http://localhost:3000

### Common Commands

All commands run inside Docker containers:

```bash
# Rails console
docker compose run --rm rails rails console

# Run database migrations
docker compose run --rm rails rails db:migrate

# Build JavaScript assets
docker compose run --rm js yarn build

# Build CSS assets
docker compose run --rm rails yarn build:css
```

### Running Tests

```bash
# Setup test database (first time only)
docker compose run --rm -e RAILS_ENV=test rails rails db:create
docker compose run --rm -e RAILS_ENV=test rails rails db:migrate

# Run all tests
docker compose run --rm test bundle exec rspec

# Run specific test file
docker compose run --rm test bundle exec rspec spec/path/to/file_spec.rb

# Run specific test by line number
docker compose run --rm test bundle exec rspec spec/path/to/file_spec.rb:42
```

### Code Quality

```bash
# Run Rubocop
docker compose run --rm rails bundle exec rubocop

# Auto-fix style issues
docker compose run --rm rails bundle exec rubocop -a
```

### Docker Services

| Service | Description              | Port |
|---------|--------------------------|------|
| rails   | Main Rails application   | 3000 |
| db      | PostgreSQL 17.6          | 5432 |
| redis   | Redis 7                  | 6379 |
| resque  | Background job workers   | -    |
| css     | CSS asset watcher        | -    |
| js      | JavaScript asset builder | -    |
| test    | Test runner              | -    |

### Plugin System

The application supports a plugin architecture for extending functionality. Plugins are added as git submodules:

```bash
# Clone with all plugins
git clone --recursive https://github.com/learningtapestry/lcms-core.git

# Or update plugins after clone
git submodule update --init --recursive

# Add a new plugin
git submodule add https://github.com/org/plugin.git lib/plugins/plugin_name
```

See `docs/plugin-system.md` for complete documentation on developing plugins.

### Multi-platform Build

To build a multi-platform image for both amd64 and arm64 architectures:

```bash
# Create a new builder instance (only needed once)
docker buildx create --name multiplatform-builder --use

# Build and push multi-platform image to registry
docker buildx build --platform linux/amd64,linux/arm64 \
  -f Dockerfile.dev \
  -t lcms-core:dev \
  --push .

# Or build and load locally (single platform only)
docker buildx build --platform linux/arm64 \
  -f Dockerfile.dev \
  -t lcms-core:dev \
  --load .
```

> **Note:** The `--push` flag requires authentication to a container registry. The `--load` flag only works with a single platform as Docker cannot load multi-platform images locally.
