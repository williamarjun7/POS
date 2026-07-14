# POS - Point of Sale System

A modern Point of Sale application built with React, TypeScript, and Vite.

## Features

- Point of Sale interface with menu management
- Table & room booking operations
- Invoice generation and thermal printing
- Payment processing (split payments, QR codes, credit accounts)
- Customer management and ledger
- Inventory and supplier management
- Expense tracking and financial reports
- Role-based access control with RLS policies
- Real-time updates

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS
- **Backend:** InsForge (PostgreSQL + PostgREST)
- **Auth:** InsForge Auth (email/password + OAuth)
- **Payments:** Fonepay QR integration

## Getting Started

```bash
npm install
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run Oxlint |
| `npm run preview` | Preview production build |
