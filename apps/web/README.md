# My React App

This project is a React + TypeScript application built with [Vite](https://vitejs.dev/). It uses Tailwind CSS, local UI helpers, and WeCom utilities.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer
- [npm](https://www.npmjs.com/)

## Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The application will be available at the URL printed in the terminal.

## Building for Production

Generate an optimized build with:

```bash
npm run build
```

You can preview the built application locally with:

```bash
npm run preview
```

## Linting

This project uses ESLint. Run the linter with:

```bash
npm run lint
```

## Environment Variables

Configuration is loaded from the `.env` file in the project root. The following variables are used:

```
VITE_API_BASE_URL   # Base URL for API requests
VITE_CORP_ID        # WeCom corporate ID
VITE_AGENT_ID       # Application agent ID
VITE_AGENT_ID_LOGIN # Agent ID used during login
```

Adjust these values as needed for your environment.
