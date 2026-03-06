const SUPABASE_URL = "https://ipohotnnmnrjlywvalud.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlwb2hvdG5ubW5yamx5d3ZhbHVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MjMzNTYsImV4cCI6MjA4Njk5OTM1Nn0.DWvgMJ-_pFZ2vid8EDopKdjNOMRnCxd07fsihGmi-20";    
window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
const supabaseClient = window.supabaseClient;

window.SUPABASE_TABLES = {
    ventas: "venta",
    instalacion: "instalacion",
    gastos: "gasto",
    mercancia: "mercancia"
};

window.getCurrentSession = async function getCurrentSession() {
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) {
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
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT" || !session) {
            window.location.replace(redirectTo || "login.html");
        }
    });
};
