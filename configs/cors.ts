import cors from "cors";

// Merge env-defined origins with hardcoded dev/staging origins
const envOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map(o => o.trim())
  : [];

const devOrigins = [
  "http://localhost:3000",
  "http://localhost:4000",
  "http://localhost:5173",  // Vite dev server
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

const prodOrigins = [
  "https://campusbaze.com",
  "https://www.campusbaze.com",
  "https://app.campusbaze.com",
  "https://campusbazefrontend.vercel.app",
];

const allowedOrigins = [
  ...new Set([...envOrigins, ...devOrigins, ...prodOrigins]),
];

const corsOptions = cors({
  origin: (origin, callback) => {
    // Allow Postman / server-to-server requests with no origin header
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`❌ CORS blocked for origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials:     true,
  methods:         ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders:  ["Content-Type", "Authorization", "x-paystack-signature"],
  exposedHeaders:  ["Authorization"],
});

export default corsOptions;
