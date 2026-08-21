import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStores";

export function LoginPage () {
    const navigate = useNavigate();

    const login = useAuthStore((store) => store.login);

    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("123456");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        try {
            setLoading(true);
            setError("");

            await login(username, password);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err?.response.data?.message || err?.message || "Login Failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-page">
            <form className="login-card" onSubmit={handleSubmit}>
                <h1>Evolve Inventory Management</h1>
                <p>Login to continue</p>

                {error && <div className="error">{error}</div>}

                <label>Username:</label>
                <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Enter your username"
                />

                <label>Password:</label>
                <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                />

                <button disabled={loading} type="submit">
                    {loading ? "Logging in..." : "Login"}
                </button>
            </form>
        </div>
    );
}
