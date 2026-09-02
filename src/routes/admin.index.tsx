import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAdminProfile, getAdminQueue, getAdminSummary, adminLogout } from "@/lib/admin-api";
import { CitizenShell } from "@/components/gov/citizen-shell";
import { LogOut, LayoutDashboard, AlertCircle, CheckCircle, Clock, MapPin, User, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

export const Route = createFileRoute("/admin/")({
    component: AdminDashboard,
});

function AdminDashboard() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [queue, setQueue] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<string>("All");

    useEffect(() => {
        async function loadData() {
            const authRes = await getAdminProfile();
            if (!authRes.ok) {
                navigate({ to: "/admin/login" });
                return;
            }
            setProfile(authRes.admin);

            const [qRes, sRes] = await Promise.all([
                getAdminQueue(),
                getAdminSummary()
            ]);

            if (qRes.ok) setQueue(qRes.grievances);
            if (sRes.ok) setSummary(sRes.summary);

            setLoading(false);
        }
        loadData();
    }, [navigate]);

    async function handleLogout() {
        await adminLogout();
        navigate({ to: "/admin/login" });
    }

    if (loading) {
        return (
            <CitizenShell>
                <div className="flex h-64 items-center justify-center">
                    <p className="text-muted-foreground animate-pulse">Loading secure sector...</p>
                </div>
            </CitizenShell>
        );
    }

    const filteredQueue = activeTab === "All" ? queue : queue.filter(g => g.severity === activeTab);

    return (
        <CitizenShell>
            <div className="mx-auto max-w-5xl px-4 py-10">

                {/* Header Ribbon */}
                <div className="flex items-center justify-between mb-8 pb-4 border-b">
                    <div>
                        <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
                            <LayoutDashboard className="text-primary size-7" />
                            Department Queue
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Logged in as {profile?.fullName} ({profile?.role})
                        </p>
                    </div>
                    <Button variant="outline" onClick={handleLogout} className="flex gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                        <LogOut className="size-4" />
                        Logout
                    </Button>
                </div>

                {/* Dashboard Stats */}
                {summary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <Card className="border-red-500/30 bg-red-50 dark:bg-red-950/20">
                            <CardHeader className="py-4">
                                <CardDescription className="text-red-700 font-semibold">Priority 1 (P1)</CardDescription>
                                <CardTitle className="text-3xl text-red-700">{summary.P1}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card className="border-orange-500/30 bg-orange-50 dark:bg-orange-950/20">
                            <CardHeader className="py-4">
                                <CardDescription className="text-orange-700 font-semibold">Priority 2 (P2)</CardDescription>
                                <CardTitle className="text-3xl text-orange-700">{summary.P2}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card className="border-blue-500/30 bg-blue-50 dark:bg-blue-950/20">
                            <CardHeader className="py-4">
                                <CardDescription className="text-blue-700 font-semibold">Priority 3 (P3)</CardDescription>
                                <CardTitle className="text-3xl text-blue-700">{summary.P3}</CardTitle>
                            </CardHeader>
                        </Card>
                        <Card className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
                            <CardHeader className="py-4">
                                <CardDescription className="text-green-700 font-semibold">Total Assigned</CardDescription>
                                <CardTitle className="text-3xl text-green-700">{summary.total}</CardTitle>
                            </CardHeader>
                        </Card>
                    </div>
                )}

                <Tabs defaultValue="All" onValueChange={setActiveTab} className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="font-semibold text-lg">Active Cases ({filteredQueue.length})</h2>
                        <TabsList>
                            <TabsTrigger value="All">All Cases</TabsTrigger>
                            <TabsTrigger value="P1" className="text-red-600 data-[state=active]:bg-red-100 dark:data-[state=active]:bg-red-900/30">P1 High</TabsTrigger>
                            <TabsTrigger value="P2" className="text-orange-600 data-[state=active]:bg-orange-100 dark:data-[state=active]:bg-orange-900/30">P2 Medium</TabsTrigger>
                            <TabsTrigger value="P3" className="text-blue-600 data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900/30">P3 Low</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value={activeTab} className="mt-0">
                        {filteredQueue.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg">
                                No {activeTab !== "All" ? activeTab : ""} grievances assigned to your jurisdiction.
                            </div>
                        ) : (
                            <Accordion type="single" collapsible className="space-y-4">
                                {filteredQueue.map((g: any) => {
                                    const bColor = g.severity === "P1" ? "border-red-500"
                                        : g.severity === "P2" ? "border-orange-500"
                                            : "border-blue-500";
                                    
                                    const bgColor = g.severity === "P1" ? "bg-red-600"
                                        : g.severity === "P2" ? "bg-orange-500"
                                            : "bg-blue-600";

                                    return (
                                        <AccordionItem key={g._id} value={g._id} className={`border border-l-4 shadow-sm rounded-lg overflow-hidden bg-card ${bColor}`}>
                                            <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/30">
                                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-4 text-left">
                                                    
                                                    {/* Header info (Compact) */}
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${bgColor}`}>
                                                                {g.severity}
                                                            </span>
                                                            <span className="text-sm font-medium">
                                                                {g.routingMeta?.wasFallback ? "Unrouted Fallback" : g.subCategory}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground ml-2">
                                                                ({g.language.toUpperCase()})
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground line-clamp-1 max-w-xl">
                                                            {g.rawText}
                                                        </p>
                                                    </div>

                                                    {/* Status & Date */}
                                                    <div className="flex items-center gap-4 shrink-0">
                                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                            <Clock className="size-3" />
                                                            {new Date(g.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-muted rounded-full text-xs font-medium">
                                                            {g.status === "assigned" ? <AlertCircle className="size-3 text-orange-600" /> : <CheckCircle className="size-3 text-green-600" />}
                                                            {g.status.toUpperCase()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </AccordionTrigger>

                                            <AccordionContent className="px-5 pb-5 pt-2 border-t">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                                                    
                                                    {/* Description Section */}
                                                    <div className="md:col-span-2 space-y-4">
                                                        <div>
                                                            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Full Description</h4>
                                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{g.rawText}</p>
                                                        </div>
                                                        
                                                        {/* Metadata cards */}
                                                        <div className="flex gap-4">
                                                            <div className="flex gap-2 items-start p-3 bg-secondary/30 rounded-md border text-sm flex-1">
                                                                <User className="size-4 text-muted-foreground mt-0.5" />
                                                                <div>
                                                                    <p className="font-medium">Citizen Information</p>
                                                                    {g.citizen ? (
                                                                        <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                                                                            <p>{g.citizen.fullName || 'Anonymous'}</p>
                                                                            <p>{g.citizen.mobile || 'No phone number'}</p>
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-xs text-muted-foreground mt-0.5">Anonymous User</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="flex gap-2 items-start p-3 bg-secondary/30 rounded-md border text-sm flex-1">
                                                                <MapPin className="size-4 text-muted-foreground mt-0.5" />
                                                                <div>
                                                                    <p className="font-medium">Location Details</p>
                                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                                        {g.location?.ward ? `${g.location.ward}, ` : ''}
                                                                        {g.location?.block ? `${g.location.block}, ` : ''}
                                                                        {g.location?.district ? `${g.location.district}, ` : ''}
                                                                        {g.location?.state || 'Maharashtra'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Image Placeholder */}
                                                    <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md bg-secondary/20 h-40 md:h-full p-4">
                                                        <ImageIcon className="size-8 text-muted-foreground mb-2" />
                                                        <p className="text-xs font-medium text-muted-foreground">No Image Attached</p>
                                                    </div>

                                                </div>
                                                
                                                {/* Actions */}
                                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                                                    <Button variant="outline" size="sm">Request More Info</Button>
                                                    <Button size="sm">Mark In-Progress</Button>
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                        )}
                    </TabsContent>
                </Tabs>
            </div>
        </CitizenShell>
    );
}
