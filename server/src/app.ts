import express from "express";
import cors from "cors";
import router from "./routes";
import { errorMiddleware } from "./middleware/errorMiddleware";

const app = express();
const allowedOrigins = [
    "http://localhost:5173",
    "https://blpbn586-5173.asse.devtunnels.ms",
];

app.use(
    cors({
        origin: allowedOrigins,
        credentials:true,
    })
);

app.use(express.json());

app.use("/api", router);
app.use(errorMiddleware);

export default app;
