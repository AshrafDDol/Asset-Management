import express from "express";
import cors from "cors";
import router from "./routes";
import { errorMiddleware } from "./middleware/errorMiddleware";

const app = express();

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials:true,
    })
);
app.use(express.json());

app.use("/api", router);
app.use(errorMiddleware);

export default app;
