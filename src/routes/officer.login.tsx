import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/officer/login")({
    beforeLoad: () => {
        throw redirect({ to: "/admin/login", replace: true });
    }
});
