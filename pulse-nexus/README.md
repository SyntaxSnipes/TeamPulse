This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
## Pitch

“The SOP gives the rules; history gives the timing.”  
“We read events from existing systems and do not ask staff to enter anything twice.”  
“A deviation means worth a look, never a verdict.”

## Integration and deployment

The optional edge connector listens for HL7 v2 ADT, ORM, and ORU messages over
MLLP, sends an acknowledgement, converts messages to canonical events, and
forwards them to `/api/ingest` over HTTPS. It is read-only by design: there is
no write path back to the EHR, LIS, RIS, or other hospital systems, and the
connector never logs message bodies.

Run the app and connector locally with `npm run dev` and `npm run connector`.
Use `npm run connector:demo` to send sample messages. The dashboard's Live feed
toggle polls the ingest ring buffer every two seconds and uses the same event
pipeline as replay. The buffer is intentionally in memory, so it is not durable
between Vercel serverless instances; a production deployment would use a
message broker.

The connector is shipped as one small container. The app uses a standard
Next.js build. No new hardware is required, and optional location tags can be
forwarded. Hosting inside the UAE is the design for data residency. Production
sign-in is designed for the hospital identity provider using OIDC or SAML; the
demo role switcher is not SSO.

Site-specific mappings and freshness limits belong in
`config/site.example.json`. Invalid configuration fails at startup with a
descriptive validation message. The integration page describes the required
IT inputs, fail-safe behavior, and what the system does not touch.

## Clinical terminology

The demo displays Emergency Severity Index (ESI) levels 1 to 5 and uses
standard pathway terms from `lib/terminology.ts`. Local site codes must be
mapped before production use.

### CODES TO VERIFY

- Local triage codes to ESI 1–5.
- Local encounter, order, result, and discharge codes.
- Local department, room, bed, and device identifiers.
- Local HL7 and FHIR profile requirements.
- Local ownership and handoff role codes.
