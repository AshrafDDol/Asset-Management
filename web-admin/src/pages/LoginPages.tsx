import type { FormEvent } from "react";
import { useState } from "react";
import { Loader2, Warehouse } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStores";
import { errorMessage } from "../utils/errorMessage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBox } from "@/components/common/ErrorBox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
    const navigate = useNavigate();

    const login = useAuthStore((store) => store.login);

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        try {
            setLoading(true);
            setError("");

            await login(username, password);
            navigate("/dashboard");
        } catch (err) {
            setError(errorMessage(err, "Login failed"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
            <div className="w-full max-w-sm space-y-6">
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                        <Warehouse className="size-5" />
                    </div>
                    <h1 className="text-xl font-semibold tracking-tight">Evolve Inventory Management</h1>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Sign in</CardTitle>
                        <CardDescription>Enter your credentials to continue.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <ErrorBox message={error} />

                            <div className="space-y-2">
                                <Label htmlFor="username">Username or email</Label>
                                <Input
                                    id="username"
                                    autoComplete="username"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="Enter your username"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Enter your password"
                                />
                            </div>

                            <Button className="w-full" disabled={loading} type="submit">
                                {loading && <Loader2 className="animate-spin" />}
                                {loading ? "Signing in..." : "Sign in"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
