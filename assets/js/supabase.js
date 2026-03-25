const DEFAULT_SUPABASE_URL = "https://ipohotnnmnrjlywvalud.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwb2hvdG5ubW5yamx5d3ZhbHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjMzNTYsImV4cCI6MjA4Njk5OTM1Nn0.DWvgMJ-_pFZ2vid8EDopKdjNOMRnCxd07fsihGmi-20";
const externalConfig = window.SUPABASE_CONFIG || {};
const SUPABASE_URL = String(window.SUPABASE_URL || externalConfig.url || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_ANON_KEY = String(window.SUPABASE_ANON_KEY || externalConfig.anonKey || DEFAULT_SUPABASE_ANON_KEY).trim();
const isValidSupabaseUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL);
const isLikelyAnonKey = SUPABASE_ANON_KEY.split(".").length === 3;
const hasSupabaseLib = !!(window.supabase && typeof window.supabase.createClient === "function");

window.SUPABASE_CONFIG = {
    ...externalConfig,
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY
};

window.getSupabaseConnectionIssue = function getSupabaseConnectionIssue(err) {
    const msg = String(err?.message || err || "").toLowerCase();
    if (!hasSupabaseLib) return "La libreria de Supabase no cargo correctamente.";
    if (!SUPABASE_URL) return "SUPABASE_URL esta vacia.";
    if (!isValidSupabaseUrl) return "SUPABASE_URL invalida. Debe ser https://<project-ref>.supabase.co";
    if (!SUPABASE_ANON_KEY) return "SUPABASE_ANON_KEY esta vacia.";
    if (!isLikelyAnonKey) return "SUPABASE_ANON_KEY parece invalida.";
    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed")) {
        return "No se pudo conectar a Supabase. Verifica SUPABASE_URL, SUPABASE_ANON_KEY y CORS en Supabase.";
    }
    return "";
};

if (!hasSupabaseLib) {
    console.error("No se pudo inicializar Supabase: la libreria no esta disponible.");
    window.supabaseClient = null;
} else if (!isValidSupabaseUrl || !SUPABASE_ANON_KEY || !isLikelyAnonKey) {
    console.error("No se pudo inicializar Supabase:", window.getSupabaseConnectionIssue());
    window.supabaseClient = null;
} else {
    window.supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );
}
const supabaseClient = window.supabaseClient;

window.SUPABASE_TABLES = {
    ventas: "venta",
    instalacion: "instalacion",
    gastos: "gasto",
    mercancia: "mercancia",
    visitas: "visita"
};

window.getCurrentSession = async function getCurrentSession() {
    if (!window.supabaseClient) {
        throw new Error(window.getSupabaseConnectionIssue() || "Supabase client no inicializado.");
    }
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) {
        const issue = window.getSupabaseConnectionIssue(error);
        if (issue) throw new Error(`${error.message}. ${issue}`);
        throw error;
    }
    return data.session || null;
};

window.getCurrentUser = async function getCurrentUser() {
    const session = await window.getCurrentSession();
    return session ? session.user : null;
};

window.requireAuth = async function requireAuth(redirectTo) {
    const user = await window.getCurrentUser();
    if (!user) {
        window.location.replace(redirectTo || "login.html");
        return null;
    }
    return user;
};

window.watchAuthRedirect = function watchAuthRedirect(redirectTo) {
    if (!window.supabaseClient) return;
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || !session) {
            window.location.replace(redirectTo || "login.html");
        }
    });
};
