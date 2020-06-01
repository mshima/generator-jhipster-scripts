# generator-jhipster-scripts
[![NPM version](https://img.shields.io/npm/v/generator-jhipster-scripts.svg)](https://npmjs.org/package/generator-jhipster-scripts)
[![NPM Test](https://github.com/mshima/generator-jhipster-scripts/workflows/NPM%20Test/badge.svg)](https://github.com/mshima/generator-jhipster-scripts/actions?query=workflow%3A%22NPM+Test%22)
[![Dependency Status][daviddm-image]][daviddm-url]
> JHipster blueprint, create package.json scripts and package.json fixes for CI.

# Introduction

This blueprint customizes the generated project to be more friendly for CI.

This is a [JHipster](https://www.jhipster.tech/) blueprint, that is meant to be used in a JHipster application.

# Prerequisites

As this is a [JHipster](https://www.jhipster.tech/) blueprint, we expect you have JHipster and its related tools already installed:

- [Installing JHipster](https://www.jhipster.tech/installation/)

# Installation

To install this blueprint:

```bash
npm install -g generator-jhipster-scripts
```

# Usage

## To use this blueprint, run the below command

```bash
jhipster --blueprints scripts
```

## Github Actions Workflow Example

```yml
name: Integration
on: [push]
env:
  JHI_PROFILE: prod
  SPRING_OUTPUT_ANSI_ENABLED: NEVER
  SPRING_JPA_SHOW_SQL: false
  JHI_DISABLE_WEBPACK_LOGS: true
  JHI_E2E_HEADLESS: true
  NG_CLI_ANALYTICS: false

jobs:
  applications:
    name: ${{ matrix.jdl-file }} ${{ matrix.jhi-gen-version }}
    runs-on: ${{ matrix.os }}
    if: >-
      !contains(github.event.head_commit.message, '[ci skip]') &&
      !contains(github.event.head_commit.message, '[skip ci]')
    timeout-minutes: 40
    strategy:
      fail-fast: false
      matrix:
        node_version:
          - 12.14.0
        os:
          - ubuntu-latest
        jdl-file:
          - relative_path_to_jdl.jdl
        jhi-gen-version:
          - jhipster/generator-jhipster#master
          - generator-jhipster@latest
    steps:
      #----------------------------------------------------------------------
      # Install all tools and check configuration
      #----------------------------------------------------------------------
      - uses: actions/setup-node@v1
        with:
          node-version: ${{ matrix.node_version }}
      - name: Download latest chrome binary
        run: |
          sudo apt update
          sudo apt install google-chrome-stable
      - uses: actions/setup-java@v1
        with:
          java-version: '11.x'

      #----------------------------------------------------------------------
      # Create Application folder
      #----------------------------------------------------------------------
      - name: Create application folder
        run: mkdir ../app

      #----------------------------------------------------------------------
      # Checkout Sample Repository
      #----------------------------------------------------------------------
      - name: Checkout sample repository
        uses: actions/checkout@v2

      #----------------------------------------------------------------------
      # Install JHipster
      #----------------------------------------------------------------------
      - name: Install jhipster
        run: npm install -g ${{ matrix.jhi-gen-version }}

      #----------------------------------------------------------------------
      # Install scripts blueprint
      #----------------------------------------------------------------------
      - name: Install scripts blueprint
        run: npm install -g generator-jhipster-scripts

      #----------------------------------------------------------------------
      # Copy jdl file
      #----------------------------------------------------------------------
      - name: Copy jdl files
        run: cp ${{ github.workspace }}/${{ matrix.jdl-file }} .
        working-directory: ../app

      #----------------------------------------------------------------------
      # Generate project
      #----------------------------------------------------------------------
      - name: Project generation
        run: jhipster import-jdl ${{ matrix.jdl-file }} --no-insight --blueprints scripts ${{ matrix.additional-parameters }}
        working-directory: ../app

      - name: Package.json information
        run: |
          cat package.json || true
          cat */package.json || true
        working-directory: ../app

      - name: Project information
        run: jhipster info
        working-directory: ../app

      #----------------------------------------------------------------------
      # Tests
      #----------------------------------------------------------------------
      - name: Configure github actions
        run: npm run ci:github:configure
        working-directory: ../app
        id: configure

      - name: Start db containers
        run: npm run ci:test:prepare:docker
        working-directory: ../app

      - name: Start others containers
        if: ${{ steps.configure.outputs.docker_others == 'true' }}
        run: npm run docker:others
        working-directory: ../app

      - name: Frontend tests
        run: npm test
        working-directory: ../app

      - name: Backend info
        if: ${{ always() }}
        run: npm run backend:info
        working-directory: ../app
        id: backend_info

      - name: Backend javadoc
        if: ${{ steps.backend_info.outcome == 'success' && always() }}
        run: npm run backend:doc:test
        working-directory: ../app

      - name: Backend test
        if: ${{ steps.backend_info.outcome == 'success' && always() }}
        run: npm run backend:test
        working-directory: ../app

      - name: Packaging
        if: ${{ always() }}
        run: npm run java:jar
        working-directory: ../app
        id: packaging

      - name: End-to-End
        if: ${{ steps.configure.outputs.e2e == 'true' && steps.packaging.outcome == 'success' && always() }}
        run: npm run ci:e2e
        working-directory: ../app
```

## License

MIT © [Marcelo Shima]()


[daviddm-image]: https://david-dm.org/mshima/generator-jhipster-scripts.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/mshima/generator-jhipster-scripts
