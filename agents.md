# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## 🛠️ Stack & Commands
- **Stack:** Next.js 14, TypeScript, Prisma, React.
- **Package Manager:** npm.
- **Commands:** `npm run dev` (development), `npm run build` (production build), `npm run lint` (code style checks).
- **Testing:** No dedicated test files were found; testing setup needs investigation.

## ⚙️ Critical Project Conventions & Gotchas
- **Financial Data:** All monetary values (price, total, etc.) are stored as `Decimal` in Prisma. Do not use standard JavaScript `Number` types for calculations; use appropriate decimal libraries or Prisma's Decimal type handling.
- **Product Ordering:** Products with `order = 0` are implicitly treated as having the highest priority (999999) for sorting purposes. Use explicit `order = 1, 2, 3...` for intended priority.
- **Stock Atomicity:** Stock updates MUST be wrapped in `prisma.$transaction()` to prevent race conditions and ensure data integrity.
- **S3 Configuration:** Storage uses `forcePathStyle: true` and requires `rejectUnauthorized: false` due to self-signed certificates.
- **Cart Synchronization:** The cart state relies on `localStorage` and cross-tab synchronization via a custom `cart-updated` event, managed by `hooks/use-cart.ts`.
- **Legacy Data:** Several models use `_old` suffixes in their `@map` (e.g., `costos_articulos_old`), indicating potential legacy data structures that must be handled during migrations or data access.
- **ML Integration:** Complex models exist for `MLFees` and `MLDescuentos` which define specific pricing logic that must be respected.
