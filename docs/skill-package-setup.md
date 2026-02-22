---
name: openweave-package-setup
description: >
  Guía de inicialización de packages en el monorepo OpenWeave.
  Usar siempre que se vaya a crear un nuevo package bajo apps/ o packages/.
  Aplica tanto para packages TypeScript (MCP, CLI) como Python (weave-graph, weave-lint).
  Garantiza versiones exactas sin operador ^ y compatibilidad entre workspaces.
---

# OpenWeave — Creación de Packages

## Regla fundamental

Todo package nuevo debe inicializarse **exclusivamente mediante comandos de consola con `pnpm`**.  
Está **prohibido** crear o editar `package.json` manualmente.

**¿Por qué?** `pnpm` escribe versiones exactas en el momento de instalación, eliminando
el operador `^`. Esto garantiza que todos los packages del monorepo resuelvan las mismas
versiones y evita incompatibilidades silenciosas entre workspaces.

---

## Pasos obligatorios

### 1. Crear el directorio e inicializar

```bash
# Para un package de librería compartida
mkdir packages/weave-nombre && cd packages/weave-nombre
pnpm init

# Para una aplicación
mkdir apps/nombre-app && cd apps/nombre-app
pnpm init
```

### 2. Instalar dependencias con versión exacta

```bash
# Dependencias de producción (--save-exact elimina el ^)
pnpm add --save-exact nombre-paquete

# Dependencias de desarrollo
pnpm add --save-exact -D nombre-paquete

# Dependencia interna del monorepo (workspace)
pnpm add --save-exact @openweave/weave-graph@workspace:*
```

### 3. Sincronizar el workspace desde la raíz

```bash
# Volver a la raíz del monorepo
cd ../..

# Instalar y enlazar todos los workspaces
pnpm install
```

---

## Verificación post-instalación

Antes de hacer commit, confirmar que no hay `^` en el `package.json` generado:

```bash
# No debe retornar ninguna línea
grep '\^' packages/weave-nombre/package.json
```

Si aparecen entradas con `^`, corregir con:

```bash
cd packages/weave-nombre
pnpm install --save-exact
```

---

## Estructura mínima esperada

Después de la inicialización, cada package debe tener:

```
packages/weave-nombre/
├── package.json      ← Generado por pnpm init (nunca editado a mano)
├── README.md         ← Documentación del package (obligatorio)
├── src/
│   └── index.ts      ← Entry point
└── tsconfig.json     ← Extender desde la raíz: "extends": "../../tsconfig.base.json"
```

---

## Notas adicionales

- Los packages internos se referencian siempre con `@openweave/` como scope.
- Nunca usar `npm install` ni `yarn add` dentro del monorepo — solo `pnpm`.
- El campo `"private": true` es obligatorio en packages que no se publican a npm.