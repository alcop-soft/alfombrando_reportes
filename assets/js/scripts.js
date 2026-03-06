let vistActual = "ventas";

document.addEventListener("DOMContentLoaded", async () => {
  const sb = window.supabaseClient;
  if (!sb) {
    console.error("Supabase client no inicializado");
    window.location.replace("login.html");
    return;
  }
  try {
    await window.requireAuth("login.html");
  } catch (err) {
    console.error(err);
    window.location.replace("login.html");
    return;
  }
  window.watchAuthRedirect("login.html");
  const t = window.SUPABASE_TABLES || { ventas: "venta", instalacion: "instalacion", gastos: "gasto", mercancia: "mercancia" };
  const st = { ventas: [], instalacion: [], gastos: [], mercancia: [] };

  const q = (s) => document.querySelector(s);
  const today = () => new Date().toISOString().slice(0, 10);
  const tipoGasto = (x) => ({ "1": "Gasto", "2": "Capital Inicial", "3": "Ingreso", "4": "Reembolso", "5": "Transferencia" }[String(x)] || "Otros");
  const money = (n) => `$${Math.round(Number(n || 0))}`;
  const val = (obj, ...keys) => {
    for (const key of keys) {
      if (obj && obj[key] != null) return obj[key];
    }
    return "";
  };
  const asDay = (v) => String(v || "").slice(0, 10);
  const normalizeMercanciaDesc = (producto, descripcion) => {
    const p = String(producto || "").trim();
    const d = String(descripcion || "").trim();
    if (p && d) return `${p} | ${d}`;
    return p || d;
  };
  const splitMercanciaDesc = (descripcion) => {
    const raw = String(descripcion || "");
    const [producto, ...rest] = raw.split("|");
    return {
      producto: (producto || "").trim() || "-",
      descripcion: rest.join("|").trim() || raw.trim() || "-"
    };
  };
  const alertx = (m, type = "info") => {
    const c = q("#alertasContainer") || (() => { const d = document.createElement("div"); d.id = "alertasContainer"; d.className = "position-fixed top-0 end-0 p-3"; d.style.zIndex = "9999"; document.body.appendChild(d); return d; })();
    const e = document.createElement("div");
    e.className = `alert alert-${type === "error" ? "danger" : type} shadow-sm mb-2`;
    e.textContent = m;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3500);
  };

  async function load(k) {
    const { data, error } = await sb.from(t[k]).select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); alertx(`Error cargando ${k}: ${error.message}`, "error"); st[k] = []; return; }
    st[k] = data || [];
  }
  async function ins(k, p) {
    const { error } = await sb.from(t[k]).insert([p]);
    if (error) throw error;
    await load(k);
  }
  async function upd(k, id, p) {
    const { error } = await sb.from(t[k]).update(p).eq("id", id);
    if (error) throw error;
    await load(k);
  }

  function buscador(inputId, tableId) {
    const i = q(`#${inputId}`), table = q(`#${tableId}`);
    if (!i || !table) return;
    i.onkeyup = () => {
      const f = i.value.toLowerCase();
      table.querySelectorAll("tbody tr").forEach((r) => { r.style.display = r.innerText.toLowerCase().includes(f) ? "" : "none"; });
    };
  }

  async function modVentas() {
    await load("ventas");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ins("ventas", {
          fecha: q("#fecha").value, producto: q("#producto").value, descripcion: q("#referencia").value,
          cantidad: Number(q("#cantidad").value || 0), precio: Number(q("#precio").value || 0), abono: Number(q("#abono").value || 0),
          metodo_pago: q("#metodoPago").value, vendedor: q("#vendedor").value, cliente: q("#cliente").value, ubicacion_cliente: q("#ub").value, fecha_programacion: q("#fechaProgramada").value,
          total: Number(q("#cantidad").value || 0) * Number(q("#precio").value || 0)
        });
        form.reset(); renderVentas(); alertx("Venta registrada", "success");
      } catch (err) { alertx(err.message || "No se pudo guardar venta", "error"); }
    };
    renderVentas(); buscador("buscadorVentas", "datatablesSimple");
  }
  function renderVentas() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.ventas.map((v) => {
      const cantidad = Number(val(v, "cantidad") || 0);
      const precio = Number(val(v, "precio") || 0);
      const ab = Number(val(v, "abono") || 0);
      const total = cantidad * precio;
      const saldo = total - ab;
      return `<tr class="${saldo === 0 ? "table-success" : ""}"><td>${val(v, "fecha") || "-"}</td><td>${val(v, "producto") || "-"}</td><td>${val(v, "descripcion", "referencia") || "-"}</td><td>${cantidad}</td><td>${money(precio)}</td><td>${money(ab)}</td><td>${val(v, "metodo_pago", "metodoPago") || "-"}</td><td>${val(v, "vendedor") || "-"}</td><td>${val(v, "cliente") || "-"}</td><td>${val(v, "ubicacion_cliente", "ub") || "-"}</td><td>${val(v, "fecha_programacion", "fecha_programada", "fechaProgramada") || "-"}</td><td>${money(total)}</td></tr>`;
    }).join("");
    const total = st.ventas.reduce((s, v) => s + Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0), 0);
    const contado = st.ventas.reduce((s, v) => { const t2 = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0); return s + (Number(val(v, "abono") || 0) >= t2 ? t2 : 0); }, 0);
    const credito = st.ventas.reduce((s, v) => { const t2 = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0); return s + Math.max(t2 - Number(val(v, "abono") || 0), 0); }, 0);
    if (q("#ventas")) q("#ventas").textContent = st.ventas.length;
    if (q("#total")) q("#total").textContent = money(total);
    if (q("#totalContado")) q("#totalContado").textContent = money(contado);
    if (q("#totalCredito")) q("#totalCredito").textContent = money(credito);
  }

  async function modInst() {
    await load("instalacion");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    const estadoMap = { "1": "Pendiente", "2": "Listo para Instalacion", "3": "En Instalacion", "4": "Completado" };
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ins("instalacion", {
          instalador: q("#instalador").value || "Sin asignar", cliente: q("#cliente").value, telefono: q("#telefono").value, producto: q("#producto").value,
          cantidad: Number(q("#cantidad").value || 0), ubicacion: q("#ubicacion").value, fecha_entrega: q("#fechaEntrega").value,
          estado: estadoMap[q("#estado").value] || "Pendiente", observaciones: q("#observaciones").value
        });
        form.reset(); renderInst(); alertx("Instalacion registrada", "success");
      } catch (err) { alertx(err.message || "No se pudo guardar instalacion", "error"); }
    };
    renderInst(); buscador("buscadorInstalacion", "datatablesSimple");
  }
  function renderInst() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.instalacion.map((i) => {
      const estado = val(i, "estado") || "Pendiente";
      const checked = estado !== "Pendiente";
      return `<tr class="${checked ? "table-success" : ""}"><td><input type="checkbox" class="estado-check" data-id="${i.id}" ${checked ? "checked" : ""}></td><td>${val(i, "instalador") || "-"}</td><td>${val(i, "cliente") || "-"}</td><td>${val(i, "telefono") || "-"}</td><td>${val(i, "producto") || "-"}</td><td>${val(i, "cantidad") || 0}</td><td>${val(i, "ubicacion") || "-"}</td><td>${val(i, "fecha_entrega", "fechaEntrega") || "-"}</td><td>${val(i, "observaciones") || "-"}</td><td><span class="text-muted small">Cambiar estado</span></td></tr>`;
    }).join("");
    if (q("#pedidoEntregar")) q("#pedidoEntregar").textContent = st.instalacion.length;
    document.querySelectorAll(".estado-check").forEach((c) => c.onchange = async function () {
      try { await upd("instalacion", this.dataset.id, { estado: this.checked ? "Completado" : "Pendiente" }); renderInst(); }
      catch (err) { this.checked = !this.checked; alertx(err.message || "No se pudo cambiar estado", "error"); }
    });
  }

  async function modGastos() {
    await load("gastos");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ins("gastos", { tipo: q("#tipo").value, monto: Number(q("#monto").value || 0), fecha_hora: q("#fechaHora").value, descripcion: q("#descripcion").value });
        form.reset(); renderGastos(); alertx("Movimiento registrado", "success");
      } catch (err) { alertx(err.message || "No se pudo guardar movimiento", "error"); }
    };
    renderGastos(); buscador("buscadorGastos", "datatablesSimple");
  }
  function renderGastos() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.gastos.map((g) => `<tr><td>${tipoGasto(val(g, "tipo"))}</td><td>${money(val(g, "monto"))}</td><td>${val(g, "fecha_hora", "fechaHora") || "-"}</td><td>${val(g, "descripcion") || "-"}</td></tr>`).join("");
    let tg = 0, tc = 0, ti = 0; st.gastos.forEach((g) => { const m = Number(val(g, "monto") || 0); if (String(val(g, "tipo")) === "1") tg += m; else if (String(val(g, "tipo")) === "2") tc += m; else if (String(val(g, "tipo")) === "3") ti += m; });
    if (q("#totalGastos")) q("#totalGastos").textContent = money(tg);
    if (q("#totalCapitalInicial")) q("#totalCapitalInicial").textContent = money(tc);
    if (q("#totalAnadir")) q("#totalAnadir").textContent = money(ti);
    if (q("#balanceTotal")) q("#balanceTotal").textContent = money(tc + ti - tg);
    if (q("#gastosTotal")) q("#gastosTotal").textContent = st.gastos.length;
  }

  async function modMercancia() {
    await load("mercancia");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ins("mercancia", {
          fecha_recepcion: q("#fechaRecepcion").value, transportadora: q("#transportadora").value, remitente: q("#remitente").value,
          cliente_destino: q("#clienteDestino").value, cantidad_cajas: Number(q("#cantidad").value || 0),
          precio: Number(q("#precio").value || 0), descripcion: normalizeMercanciaDesc(q("#producto").value, q("#descripcion").value), observaciones: q("#observaciones").value
        });
        form.reset(); renderMercancia(); alertx("Mercancia registrada", "success");
      } catch (err) { alertx(err.message || "No se pudo guardar mercancia", "error"); }
    };
    renderMercancia(); buscador("buscadorMercancia", "datatablesSimple");
  }
  function renderMercancia() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.mercancia.map((m) => {
      const desc = splitMercanciaDesc(val(m, "descripcion"));
      return `<tr><td>${val(m, "fecha_recepcion", "fechaRecepcion") || "-"}</td><td>${val(m, "transportadora") || "-"}</td><td>${val(m, "remitente") || "-"}</td><td>${val(m, "cliente_destino", "clienteDestino") || "-"}</td><td>${desc.producto}</td><td>${val(m, "cantidad_cajas", "cantidad") || 0}</td><td>${money(val(m, "precio"))}</td><td>${desc.descripcion}</td><td>${val(m, "observaciones") || "-"}</td></tr>`;
    }).join("");
    if (q("#mercancia")) q("#mercancia").textContent = st.mercancia.length;
  }

  async function modCartera() {
    await load("ventas");
    const tb = q("#carteraTabla"), msg = q("#mensajeVacio");
    const buscador = q("#buscadorCartera"), filtroSaldo = q("#filtroSaldo"), btnExportar = q("#btnExportarCartera");
    if (!tb) return;

    const base = st.ventas.map((v) => {
      const total = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
      const ab = Number(val(v, "abono") || 0);
      return { ...v, total, ab, saldo: total - ab };
    }).filter((v) => v.saldo > 0);

    const applyFilters = () => {
      const term = String(buscador?.value || "").toLowerCase().trim();
      const saldoRule = String(filtroSaldo?.value || "todos");
      return base.filter((c) => {
        const hayTexto = !term || [val(c, "cliente"), val(c, "producto"), val(c, "descripcion", "referencia")]
          .join(" ").toLowerCase().includes(term);
        let haySaldo = true;
        if (saldoRule === "mayor-1000") haySaldo = c.saldo > 1000;
        else if (saldoRule === "mayor-500") haySaldo = c.saldo > 500;
        else if (saldoRule === "menor-500") haySaldo = c.saldo <= 500;
        return hayTexto && haySaldo;
      });
    };

    const renderFiltered = () => {
      const cart = applyFilters();
      if (!cart.length) {
        tb.innerHTML = "";
        if (msg) msg.style.display = "";
        if (q("#totalCartera")) q("#totalCartera").textContent = money(0);
        if (q("#clientesActivos")) q("#clientesActivos").textContent = "0";
        if (q("#promedioCliente")) q("#promedioCliente").textContent = money(0);
        if (q("#totalRegistros")) q("#totalRegistros").textContent = "0 registros";
        return;
      }

      if (msg) msg.style.display = "none";
      tb.innerHTML = cart.map((c, i) => `<tr><td>${val(c, "cliente") || "-"}</td><td>${val(c, "producto") || "-"}</td><td>${val(c, "descripcion", "referencia") || "-"}</td><td>${val(c, "fecha") || "-"}</td><td>${money(c.total)}</td><td>${money(c.ab)}</td><td>${money(c.saldo)}</td><td><input type="number" class="abono-input form-control form-control-sm d-inline w-50" min="0.01" step="0.01" data-i="${i}"><button class="btn btn-success btn-sm ms-2 abonar-btn" data-id="${c.id}" data-i="${i}">Abonar</button></td></tr>`).join("");
      const total = cart.reduce((s, c) => s + c.saldo, 0);
      const clientes = new Set(cart.map((c) => val(c, "cliente") || "")).size;
      if (q("#totalCartera")) q("#totalCartera").textContent = money(total);
      if (q("#clientesActivos")) q("#clientesActivos").textContent = clientes;
      if (q("#promedioCliente")) q("#promedioCliente").textContent = money(clientes ? total / clientes : 0);
      if (q("#totalRegistros")) q("#totalRegistros").textContent = `${cart.length} registros`;

      document.querySelectorAll(".abonar-btn").forEach((b) => b.onclick = async function () {
        const i = Number(this.dataset.i);
        const id = this.dataset.id;
        const inp = document.querySelector(`input.abono-input[data-i="${i}"]`);
        const abono = Number(inp?.value || 0);
        if (!abono || abono <= 0) return alertx("Ingresa un abono valido", "warning");
        if (abono > cart[i].saldo) return alertx("El abono supera el saldo", "warning");
        try {
          await upd("ventas", id, { abono: cart[i].ab + abono, total: cart[i].total });
          alertx("Abono registrado", "success");
          await modCartera();
        } catch (err) {
          alertx(err.message || "No se pudo registrar abono", "error");
        }
      });
    };

    if (buscador && !buscador.dataset.bound) {
      buscador.addEventListener("input", renderFiltered);
      buscador.dataset.bound = "1";
    }
    if (filtroSaldo && !filtroSaldo.dataset.bound) {
      filtroSaldo.addEventListener("change", renderFiltered);
      filtroSaldo.dataset.bound = "1";
    }
    if (btnExportar && !btnExportar.dataset.bound) {
      btnExportar.addEventListener("click", () => {
        const cart = applyFilters();
        if (!cart.length) return alertx("No hay datos para exportar", "warning");
        const rows = [["Cliente", "Producto", "Descripcion", "Fecha", "Total", "Abono", "Saldo"]];
        cart.forEach((c) => rows.push([
          val(c, "cliente") || "",
          val(c, "producto") || "",
          val(c, "descripcion", "referencia") || "",
          val(c, "fecha") || "",
          String(c.total),
          String(c.ab),
          String(c.saldo)
        ]));
        const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cartera_${today()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
      btnExportar.dataset.bound = "1";
    }

    renderFiltered();
  }

  function showDay() {
    const h = today();
    if (vistActual === "ventas") {
      const rows = st.ventas.filter((x) => asDay(val(x, "fecha")) === h).map((x) => `<tr><td>${val(x, "fecha") || "-"}</td><td>${val(x, "producto") || "-"}</td><td>${money(Number(val(x, "cantidad") || 0) * Number(val(x, "precio") || 0))}</td></tr>`).join("") || '<tr><td colspan="3" class="text-center">No hay ventas para hoy</td></tr>';
      if (q("#ventasDiaBody")) q("#ventasDiaBody").innerHTML = rows; if (q("#tablaVentas")) q("#tablaVentas").style.display = "none"; if (q("#ventasDia")) q("#ventasDia").style.display = "";
    }
    if (vistActual === "instalacion") {
      const rows = st.instalacion.filter((x) => asDay(val(x, "fecha_entrega", "fechaEntrega")) === h).map((x) => `<tr><td>${val(x, "estado") || "-"}</td><td>${val(x, "instalador") || "-"}</td><td>${val(x, "cliente") || "-"}</td><td>${val(x, "telefono") || "-"}</td><td>${val(x, "producto") || "-"}</td><td>${val(x, "cantidad") || 0}</td><td>${val(x, "ubicacion") || "-"}</td><td>${val(x, "fecha_entrega", "fechaEntrega") || "-"}</td><td>${val(x, "observaciones") || "-"}</td></tr>`).join("") || '<tr><td colspan="9" class="text-center">No hay instalaciones para hoy</td></tr>';
      if (q("#instalacionDiaBody")) q("#instalacionDiaBody").innerHTML = rows; if (q("#tablaInstalacion")) q("#tablaInstalacion").style.display = "none"; if (q("#instalacionDia")) q("#instalacionDia").style.display = "";
    }
    if (vistActual === "gastos") {
      const rows = st.gastos.filter((x) => asDay(val(x, "fecha_hora", "fechaHora")) === h).map((x) => `<tr><td>${tipoGasto(val(x, "tipo"))}</td><td>${money(val(x, "monto"))}</td><td>${val(x, "fecha_hora", "fechaHora") || "-"}</td><td>${val(x, "descripcion") || "-"}</td></tr>`).join("") || '<tr><td colspan="4" class="text-center">No hay gastos para hoy</td></tr>';
      if (q("#gastosDiaBody")) q("#gastosDiaBody").innerHTML = rows; if (q("#tablaGastos")) q("#tablaGastos").style.display = "none"; if (q("#gastosDia")) q("#gastosDia").style.display = "";
    }
    if (vistActual === "mercancia") {
      const rows = st.mercancia.filter((x) => asDay(val(x, "fecha_recepcion", "fechaRecepcion")) === h).map((x) => {
        const desc = splitMercanciaDesc(val(x, "descripcion"));
        return `<tr><td>${val(x, "fecha_recepcion", "fechaRecepcion") || "-"}</td><td>${val(x, "transportadora") || "-"}</td><td>${val(x, "remitente") || "-"}</td><td>${val(x, "cliente_destino", "clienteDestino") || "-"}</td><td>${desc.producto}</td><td>${val(x, "cantidad_cajas", "cantidad") || 0}</td><td>${money(val(x, "precio"))}</td><td>${desc.descripcion}</td><td>${val(x, "observaciones") || "-"}</td></tr>`;
      }).join("") || '<tr><td colspan="9" class="text-center">No hay registros para hoy</td></tr>';
      if (q("#mercanciaDiaBody")) q("#mercanciaDiaBody").innerHTML = rows; if (q("#tablamercancia")) q("#tablamercancia").style.display = "none"; if (q("#mercanciaDia")) q("#mercanciaDia").style.display = "";
    }
  }
  function showAll() {
    ["#tablaVentas", "#tablamercancia", "#tablaInstalacion", "#tablaGastos"].forEach((id) => { const e = q(id); if (e) e.style.display = ""; });
    ["#ventasDia", "#mercanciaDia", "#instalacionDia", "#gastosDia"].forEach((id) => { const e = q(id); if (e) e.style.display = "none"; });
  }

  const logout = q("#btnCerrarSesion");
  if (logout) logout.onclick = async () => { await sb.auth.signOut(); window.location.href = "login.html"; };

  document.addEventListener("click", (e) => {
    const id = e.target && e.target.id;
    if (["btnVentasDia", "btnInstalacionDia", "btnGastosDia", "btnmercanciaDia"].includes(id)) showDay();
    if (["btnVentas", "btnInstalacion", "btnGastos", "btnmercancia"].includes(id)) showAll();
  });

  const sidebar = q("#sidebar"), overlay = q("#sidebarOverlay"), openBtn = q("#btnToggleSidebar"), closeBtn = q("#btnCloseSidebar");
  if (openBtn) openBtn.onclick = () => { sidebar.classList.add("show"); overlay.classList.add("show"); };
  if (closeBtn) closeBtn.onclick = () => { sidebar.classList.remove("show"); overlay.classList.remove("show"); };
  if (overlay) overlay.onclick = () => { sidebar.classList.remove("show"); overlay.classList.remove("show"); };

  const views = { ventas: "Registro de Ventas", instalacion: "Reporte de Instalacion", mercancia: "Reporte de Mercancia", gastos: "Reporte de Gastos", cartera: "Cartera de Clientes" };
  const links = document.querySelectorAll(".nav-link"), title = q("#viewTitle");
  async function init(v) { showAll(); if (v === "ventas") await modVentas(); else if (v === "instalacion") await modInst(); else if (v === "gastos") await modGastos(); else if (v === "mercancia") await modMercancia(); else if (v === "cartera") await modCartera(); }
  function change(v) {
    const c = q("#viewContainer"); if (!c || !views[v]) return;
    c.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>'; vistActual = v;
    fetch(`views/${v}.html`).then((r) => { if (!r.ok) throw new Error("Vista no encontrada"); return r.text(); }).then(async (html) => {
      c.innerHTML = html; if (title) title.textContent = views[v];
      links.forEach((l) => { l.classList.toggle("active", l.getAttribute("data-view") === v); });
      await init(v); if (sidebar) sidebar.classList.remove("show"); if (overlay) overlay.classList.remove("show");
    }).catch((err) => { console.error(err); c.innerHTML = '<div class="alert alert-danger">Error al cargar la vista</div>'; });
  }
  links.forEach((l) => l.addEventListener("click", (e) => { e.preventDefault(); change(l.getAttribute("data-view")); }));
  change("ventas");
});
