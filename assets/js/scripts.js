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
  let instEditClickBound = false;
  let ventasEditClickBound = false;
  let mercanciaEditClickBound = false;
  const charts = {};

  const q = (s) => document.querySelector(s);
  const txt = (s) => String(s || "").trim();
  const today = () => new Date().toISOString().slice(0, 10);
  const tipoGasto = (x) => ({ "1": "Gasto", "2": "Capital Inicial", "3": "Ingreso", "4": "Reembolso", "5": "Transferencia" }[String(x)] || "Otros");
  const intFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const fmtInt = (n) => intFmt.format(Math.round(Number(n || 0)));
  const money = (n) => `$${fmtInt(n)}`;
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
  const canonProducto = (raw) => {
    let s = String(raw || "").toLowerCase().trim();
    if (!s) return "Sin producto";
    // Normaliza acentos y caracteres raros
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Corrige errores tipicos de digitacion
    s = s.replace(/\bpaple\b/g, "papel");
    s = s.replace(/\bcolgaduraa?\b/g, "colgadura");
    s = s.replace(/\bcolgadrua\b/g, "colgadura");
    s = s.replace(/\bde\s+colgadura\b/g, "de colgadura");
    // Limpia separadores y espacios
    s = s.replace(/[_\-\/.,;:]+/g, " ").replace(/\s+/g, " ").trim();
    // Reglas de unificacion por familia
    if (s.includes("papel") && s.includes("colgadura")) return "Papel de colgadura";
    if (s.includes("vinilo")) return "Vinilo";
    if (s.includes("cenefa")) return "Cenefa";
    if (s.includes("pegante") || s.includes("adhesivo")) return "Pegante";
    // Titulo por defecto
    return s.split(" ").map((w) => w ? `${w[0].toUpperCase()}${w.slice(1)}` : "").join(" ");
  };
  const alertx = (m, type = "info") => {
    if (window.Swal) {
      window.Swal.fire({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
        icon: type === "error" ? "error" : type === "warning" ? "warning" : type === "success" ? "success" : "info",
        title: m
      });
      return;
    }
    const c = q("#alertasContainer") || (() => { const d = document.createElement("div"); d.id = "alertasContainer"; d.className = "position-fixed top-0 end-0 p-3"; d.style.zIndex = "9999"; document.body.appendChild(d); return d; })();
    const e = document.createElement("div");
    e.className = `alert alert-${type === "error" ? "danger" : type} shadow-sm mb-2`;
    e.textContent = m;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3500);
  };
  const logHistory = (module, action, payload = {}) => {
    const key = "historial_cambios";
    const base = JSON.parse(localStorage.getItem(key) || "[]");
    base.unshift({ module, action, payload, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(base.slice(0, 500)));
  };
  const normalizeSortVal = (v) => {
    const t2 = String(v || "").trim();
    const n = Number(t2.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(n) && t2.match(/[\d]/)) return n;
    const d = Date.parse(t2);
    if (!Number.isNaN(d) && t2.match(/\d{4}-\d{2}-\d{2}/)) return d;
    return t2.toLowerCase();
  };
  const enableTableSort = (table) => {
    if (!table || table.dataset.sortReady) return;
    const ths = table.querySelectorAll("thead th");
    ths.forEach((th, idx) => {
      th.style.cursor = "pointer";
      th.title = "Ordenar";
      th.addEventListener("click", () => {
        const tbody = table.querySelector("tbody");
        if (!tbody) return;
        const rows = [...tbody.querySelectorAll("tr")];
        const asc = th.dataset.asc !== "1";
        th.dataset.asc = asc ? "1" : "0";
        rows.sort((a, b) => {
          const av = normalizeSortVal(a.children[idx]?.innerText || "");
          const bv = normalizeSortVal(b.children[idx]?.innerText || "");
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
        tbody.innerHTML = "";
        rows.forEach((r) => tbody.appendChild(r));
      });
    });
    table.dataset.sortReady = "1";
  };
  const exportTableExcel = (table, fileName) => {
    if (!window.XLSX || !table) return alertx("No se pudo exportar a Excel", "error");
    const wb = window.XLSX.utils.table_to_book(table, { sheet: "Reporte" });
    window.XLSX.writeFile(wb, `${fileName}_${today()}.xlsx`);
  };
  const exportTablePdf = (table, title) => {
    if (!window.jspdf || !window.jspdf.jsPDF || !table) return alertx("No se pudo exportar a PDF", "error");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text(title, 14, 12);
    doc.autoTable({ html: table, startY: 16, styles: { fontSize: 7 } });
    doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}_${today()}.pdf`);
  };
  const mountTableTools = (moduleKey) => {
    const table = q("#datatablesSimple") || q("#carteraTabla")?.closest("table");
    const host = q(".toolbar-responsive") || q("#btnExportarCartera")?.closest(".row");
    if (!table || !host) return;
    enableTableSort(table);
    if (host.querySelector(".export-tools")) return;
    const wrap = document.createElement("div");
    wrap.className = "btn-group export-tools";
    wrap.innerHTML = `<button class="btn btn-outline-success" type="button" id="btnExcel_${moduleKey}"><i class="fas fa-file-excel me-2"></i>Excel</button><button class="btn btn-outline-danger" type="button" id="btnPdf_${moduleKey}"><i class="fas fa-file-pdf me-2"></i>PDF</button>`;
    host.appendChild(wrap);
    q(`#btnExcel_${moduleKey}`)?.addEventListener("click", () => exportTableExcel(table, moduleKey));
    q(`#btnPdf_${moduleKey}`)?.addEventListener("click", () => exportTablePdf(table, `Reporte ${moduleKey}`));
  };

  async function load(k) {
    const { data, error } = await sb.from(t[k]).select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); alertx(`Error cargando ${k}: ${error.message}`, "error"); st[k] = []; return; }
    st[k] = data || [];
  }
  async function ins(k, p) {
    const { error } = await sb.from(t[k]).insert([p]);
    if (error) throw error;
    logHistory(k, "crear", p);
    await load(k);
  }
  async function upd(k, id, p) {
    const { error } = await sb.from(t[k]).update(p).eq("id", id);
    if (error) throw error;
    logHistory(k, "editar", { id, ...p });
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
    const editForm = q("#editVentaForm");
    const modalEl = q("#editarVentaModal");
    const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const btnAgregar = q("#btnAgregarProducto");
    const carritoBody = q("#carritoVentasBody");
    const carritoTotalEl = q("#carritoTotalGeneral");
    const carritoCantidadEl = q("#carritoCantidad");
    let carritoProductos = [];

    const renderCarrito = () => {
      if (!carritoBody) return;
      if (!carritoProductos.length) {
        carritoBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay productos agregados</td></tr>';
      } else {
        carritoBody.innerHTML = carritoProductos.map((item, i) =>
          `<tr><td>${item.producto}</td><td>${item.descripcion || "-"}</td><td>${fmtInt(item.cantidad)}</td><td>${money(item.precio)}</td><td>${money(item.subtotal)}</td><td><button type="button" class="btn btn-sm btn-outline-danger quitar-item-btn" data-i="${i}"><i class="fas fa-trash"></i></button></td></tr>`
        ).join("");
      }
      const total = carritoProductos.reduce((s, x) => s + Number(x.subtotal || 0), 0);
      if (carritoTotalEl) carritoTotalEl.textContent = money(total);
      if (carritoCantidadEl) carritoCantidadEl.textContent = fmtInt(carritoProductos.length);
    };

    const limpiarCarrito = () => {
      carritoProductos = [];
      renderCarrito();
    };

    if (btnAgregar && !btnAgregar.dataset.bound) {
      btnAgregar.addEventListener("click", () => {
        const producto = txt(q("#producto")?.value);
        const descripcion = txt(q("#referencia")?.value);
        const cantidad = Number(q("#cantidad")?.value || 0);
        const precio = Number(q("#precio")?.value || 0);
        if (!producto) return alertx("Ingresa el producto", "warning");
        if (!cantidad || cantidad <= 0) return alertx("Cantidad invalida", "warning");
        if (!precio || precio <= 0) return alertx("Precio invalido", "warning");
        carritoProductos.push({ producto, descripcion, cantidad, precio, subtotal: cantidad * precio });
        if (q("#producto")) q("#producto").value = "";
        if (q("#referencia")) q("#referencia").value = "";
        if (q("#cantidad")) q("#cantidad").value = "";
        if (q("#precio")) q("#precio").value = "";
        renderCarrito();
        alertx("Producto agregado al carrito", "success");
      });
      btnAgregar.dataset.bound = "1";
    }

    if (carritoBody && !carritoBody.dataset.bound) {
      carritoBody.addEventListener("click", (e) => {
        const btn = e.target.closest(".quitar-item-btn");
        if (!btn) return;
        const i = Number(btn.dataset.i);
        carritoProductos.splice(i, 1);
        renderCarrito();
      });
      carritoBody.dataset.bound = "1";
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!carritoProductos.length) return alertx("Agrega al menos un producto al carrito", "warning");
      try {
        const fecha = q("#fecha").value;
        const numeroRecibo = txt(q("#numeroRecibo")?.value);
        const numeroPedido = txt(q("#numeroPedido")?.value);
        const abono = Number(q("#abono").value || 0);
        const metodoPago = q("#metodoPago").value;
        const vendedor = q("#vendedor").value;
        const cliente = q("#cliente").value;
        const ubicacion = q("#ub").value;
        const fechaProgramada = q("#fechaProgramada").value;
        for (const item of carritoProductos) {
          await ins("ventas", {
            fecha,
            numero_recibo: numeroRecibo,
            numero_pedido: numeroPedido,
            producto: item.producto,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio: item.precio,
            abono,
            metodo_pago: metodoPago,
            vendedor,
            cliente,
            ubicacion_cliente: ubicacion,
            fecha_programacion: fechaProgramada,
            total: item.cantidad * item.precio
          });
        }
        form.reset();
        limpiarCarrito();
        renderVentas();
        if (window.Swal) {
          await window.Swal.fire({ icon: "success", title: "Venta registrada correctamente", timer: 1800, showConfirmButton: false });
        } else {
          alertx("Venta registrada correctamente", "success");
        }
      } catch (err) { alertx(err.message || "No se pudo guardar venta", "error"); }
    };
    form.addEventListener("reset", () => setTimeout(() => limpiarCarrito(), 0));
    if (editForm && !editForm.dataset.bound) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = q("#editVentaId")?.value;
        if (!id) return;
        const cantidad = Number(q("#editVentaCantidad").value || 0);
        const precio = Number(q("#editVentaPrecio").value || 0);
        try {
          await upd("ventas", id, {
            fecha: q("#editVentaFecha").value,
            numero_recibo: txt(q("#editVentaNumeroRecibo")?.value),
            numero_pedido: txt(q("#editVentaNumeroPedido")?.value),
            producto: q("#editVentaProducto").value,
            descripcion: q("#editVentaReferencia").value,
            cantidad,
            precio,
            abono: Number(q("#editVentaAbono").value || 0),
            metodo_pago: q("#editVentaMetodoPago").value,
            vendedor: q("#editVentaVendedor").value,
            fecha_programacion: q("#editVentaFechaProgramada").value,
            total: cantidad * precio
          });
          renderVentas();
          if (modal) modal.hide();
          alertx("Venta actualizada", "success");
        } catch (err) {
          alertx(err.message || "No se pudo actualizar venta", "error");
        }
      };
      editForm.dataset.bound = "1";
    }
    if (!ventasEditClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".edit-venta-btn");
        if (!btn) return;
        const item = st.ventas.find((x) => String(x.id) === String(btn.dataset.id));
        if (!item) return;
        if (q("#editVentaId")) q("#editVentaId").value = item.id;
        if (q("#editVentaFecha")) q("#editVentaFecha").value = val(item, "fecha") || "";
        if (q("#editVentaNumeroRecibo")) q("#editVentaNumeroRecibo").value = val(item, "numero_recibo", "numeroRecibo") || "";
        if (q("#editVentaNumeroPedido")) q("#editVentaNumeroPedido").value = val(item, "numero_pedido", "numeroPedido") || "";
        if (q("#editVentaProducto")) q("#editVentaProducto").value = val(item, "producto") || "";
        if (q("#editVentaReferencia")) q("#editVentaReferencia").value = val(item, "descripcion", "referencia") || "";
        if (q("#editVentaCantidad")) q("#editVentaCantidad").value = Number(val(item, "cantidad") || 0);
        if (q("#editVentaPrecio")) q("#editVentaPrecio").value = Number(val(item, "precio") || 0);
        if (q("#editVentaAbono")) q("#editVentaAbono").value = Number(val(item, "abono") || 0);
        if (q("#editVentaMetodoPago")) q("#editVentaMetodoPago").value = val(item, "metodo_pago", "metodoPago") || "";
        if (q("#editVentaVendedor")) q("#editVentaVendedor").value = val(item, "vendedor") || "";
        if (q("#editVentaFechaProgramada")) q("#editVentaFechaProgramada").value = val(item, "fecha_programacion", "fecha_programada", "fechaProgramada") || "";
        const currentModalEl = q("#editarVentaModal");
        const currentModal = currentModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(currentModalEl) : null;
        if (currentModal) currentModal.show();
      }, { passive: true });
      ventasEditClickBound = true;
    }
    renderCarrito();
    renderVentas(); buscador("buscadorVentas", "datatablesSimple"); mountTableTools("ventas");
  }
  function renderVentas() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.ventas.map((v) => {
      const cantidad = Number(val(v, "cantidad") || 0);
      const precio = Number(val(v, "precio") || 0);
      const ab = Number(val(v, "abono") || 0);
      const total = cantidad * precio;
      const saldo = total - ab;
      return `<tr class="${saldo === 0 ? "table-success" : ""}"><td>${val(v, "fecha") || "-"}</td><td>${val(v, "numero_recibo", "numeroRecibo") || "-"}</td><td>${val(v, "numero_pedido", "numeroPedido") || "-"}</td><td>${val(v, "producto") || "-"}</td><td>${val(v, "descripcion", "referencia") || "-"}</td><td>${fmtInt(cantidad)}</td><td>${money(precio)}</td><td>${money(ab)}</td><td>${val(v, "metodo_pago", "metodoPago") || "-"}</td><td>${val(v, "vendedor") || "-"}</td><td>${val(v, "cliente") || "-"}</td><td>${val(v, "ubicacion_cliente", "ub") || "-"}</td><td>${val(v, "fecha_programacion", "fecha_programada", "fechaProgramada") || "-"}</td><td>${money(total)}</td><td><button type="button" class="btn btn-sm btn-outline-primary edit-venta-btn" data-id="${v.id}"><i class="fas fa-pen me-1"></i>Editar</button></td></tr>`;
    }).join("");
    const total = st.ventas.reduce((s, v) => s + Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0), 0);
    const contado = st.ventas.reduce((s, v) => { const t2 = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0); return s + (Number(val(v, "abono") || 0) >= t2 ? t2 : 0); }, 0);
    const credito = st.ventas.reduce((s, v) => { const t2 = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0); return s + Math.max(t2 - Number(val(v, "abono") || 0), 0); }, 0);
    if (q("#ventas")) q("#ventas").textContent = fmtInt(st.ventas.length);
    if (q("#total")) q("#total").textContent = money(total);
    if (q("#totalContado")) q("#totalContado").textContent = money(contado);
    if (q("#totalCredito")) q("#totalCredito").textContent = money(credito);
  }

  async function modInst() {
    await load("instalacion");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    const estadoMap = { "1": "Pendiente", "2": "Listo para Instalacion", "3": "En Instalacion", "4": "Completado" };
    const estadoToValue = { Pendiente: "1", "Listo para Instalacion": "2", "Listo para Instalación": "2", "En Instalacion": "3", "En Instalación": "3", Completado: "4" };
    const modalEl = q("#editarInstalacionModal");
    const editForm = q("#editInstalacionForm");
    const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
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
    if (editForm && !editForm.dataset.bound) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = q("#editInstId")?.value;
        if (!id) return;
        try {
          await upd("instalacion", id, {
            instalador: q("#editInstalador").value || "Sin asignar",
            telefono: q("#editTelefono").value,
            cantidad: Number(q("#editCantidad").value || 0),
            ubicacion: q("#editUbicacion").value,
            fecha_entrega: q("#editFechaEntrega").value,
            estado: estadoMap[q("#editEstado").value] || "Pendiente",
            observaciones: q("#editObservaciones").value
          });
          renderInst();
          if (modal) modal.hide();
          alertx("Instalacion actualizada", "success");
        } catch (err) {
          alertx(err.message || "No se pudo actualizar instalacion", "error");
        }
      };
      editForm.dataset.bound = "1";
    }

    if (!instEditClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".edit-inst-btn");
        if (!btn) return;
        const item = st.instalacion.find((x) => String(x.id) === String(btn.dataset.id));
        if (!item) return;
        if (q("#editInstId")) q("#editInstId").value = item.id;
        if (q("#editInstalador")) q("#editInstalador").value = val(item, "instalador") || "";
        if (q("#editTelefono")) q("#editTelefono").value = val(item, "telefono") || "";
        if (q("#editCantidad")) q("#editCantidad").value = Number(val(item, "cantidad") || 0);
        if (q("#editUbicacion")) q("#editUbicacion").value = val(item, "ubicacion") || "";
        if (q("#editFechaEntrega")) q("#editFechaEntrega").value = val(item, "fecha_entrega", "fechaEntrega") || "";
        if (q("#editEstado")) q("#editEstado").value = estadoToValue[val(item, "estado")] || "1";
        if (q("#editObservaciones")) q("#editObservaciones").value = val(item, "observaciones") || "";
        const currentModalEl = q("#editarInstalacionModal");
        const currentModal = currentModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(currentModalEl) : null;
        if (currentModal) currentModal.show();
      }, { passive: true });
      instEditClickBound = true;
    }

    renderInst(); buscador("buscadorInstalacion", "datatablesSimple"); mountTableTools("instalacion");
  }
  function renderInst() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.instalacion.map((i) => {
      const estado = val(i, "estado") || "Pendiente";
      const checked = estado !== "Pendiente";
      return `<tr class="${checked ? "table-success" : ""}"><td><input type="checkbox" class="estado-check" data-id="${i.id}" ${checked ? "checked" : ""}></td><td>${val(i, "instalador") || "-"}</td><td>${val(i, "cliente") || "-"}</td><td>${val(i, "telefono") || "-"}</td><td>${val(i, "producto") || "-"}</td><td>${fmtInt(val(i, "cantidad"))}</td><td>${val(i, "ubicacion") || "-"}</td><td>${val(i, "fecha_entrega", "fechaEntrega") || "-"}</td><td>${val(i, "observaciones") || "-"}</td><td><button type="button" class="btn btn-sm btn-outline-primary edit-inst-btn" data-id="${i.id}"><i class="fas fa-pen me-1"></i>Editar</button></td></tr>`;
    }).join("");
    if (q("#pedidoEntregar")) q("#pedidoEntregar").textContent = fmtInt(st.instalacion.length);
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
    renderGastos(); buscador("buscadorGastos", "datatablesSimple"); mountTableTools("gastos");
  }
  function renderGastos() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.gastos.map((g) => `<tr><td>${tipoGasto(val(g, "tipo"))}</td><td>${money(val(g, "monto"))}</td><td>${val(g, "fecha_hora", "fechaHora") || "-"}</td><td>${val(g, "descripcion") || "-"}</td></tr>`).join("");
    let tg = 0, tc = 0, ti = 0; st.gastos.forEach((g) => { const m = Number(val(g, "monto") || 0); if (String(val(g, "tipo")) === "1") tg += m; else if (String(val(g, "tipo")) === "2") tc += m; else if (String(val(g, "tipo")) === "3") ti += m; });
    if (q("#totalGastos")) q("#totalGastos").textContent = money(tg);
    if (q("#totalCapitalInicial")) q("#totalCapitalInicial").textContent = money(tc);
    if (q("#totalAnadir")) q("#totalAnadir").textContent = money(ti);
    if (q("#balanceTotal")) q("#balanceTotal").textContent = money(tc + ti - tg);
    if (q("#gastosTotal")) q("#gastosTotal").textContent = fmtInt(st.gastos.length);
  }

  async function modMercancia() {
    await load("mercancia");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    const editForm = q("#editMercanciaForm");
    const modalEl = q("#editarMercanciaModal");
    const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
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
    if (editForm && !editForm.dataset.bound) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = q("#editMercanciaId")?.value;
        if (!id) return;
        try {
          await upd("mercancia", id, {
            fecha_recepcion: q("#editFechaRecepcion").value,
            transportadora: q("#editTransportadora").value,
            remitente: q("#editRemitente").value,
            cliente_destino: q("#editClienteDestino").value,
            cantidad_cajas: Number(q("#editCantidadCajas").value || 0),
            precio: Number(q("#editValorTransporte").value || 0),
            descripcion: normalizeMercanciaDesc(q("#editProductoMercancia").value, q("#editDescripcionMercancia").value),
            observaciones: q("#editObservacionesMercancia").value
          });
          renderMercancia();
          if (modal) modal.hide();
          alertx("Mercancia actualizada", "success");
        } catch (err) {
          alertx(err.message || "No se pudo actualizar mercancia", "error");
        }
      };
      editForm.dataset.bound = "1";
    }
    if (!mercanciaEditClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".edit-mercancia-btn");
        if (!btn) return;
        const item = st.mercancia.find((x) => String(x.id) === String(btn.dataset.id));
        if (!item) return;
        const desc = splitMercanciaDesc(val(item, "descripcion"));
        if (q("#editMercanciaId")) q("#editMercanciaId").value = item.id;
        if (q("#editFechaRecepcion")) q("#editFechaRecepcion").value = val(item, "fecha_recepcion", "fechaRecepcion") || "";
        if (q("#editTransportadora")) q("#editTransportadora").value = val(item, "transportadora") || "";
        if (q("#editRemitente")) q("#editRemitente").value = val(item, "remitente") || "";
        if (q("#editClienteDestino")) q("#editClienteDestino").value = val(item, "cliente_destino", "clienteDestino") || "";
        if (q("#editProductoMercancia")) q("#editProductoMercancia").value = desc.producto === "-" ? "" : desc.producto;
        if (q("#editCantidadCajas")) q("#editCantidadCajas").value = Number(val(item, "cantidad_cajas", "cantidad") || 0);
        if (q("#editValorTransporte")) q("#editValorTransporte").value = Number(val(item, "precio") || 0);
        if (q("#editDescripcionMercancia")) q("#editDescripcionMercancia").value = desc.descripcion === "-" ? "" : desc.descripcion;
        if (q("#editObservacionesMercancia")) q("#editObservacionesMercancia").value = val(item, "observaciones") || "";
        const currentModalEl = q("#editarMercanciaModal");
        const currentModal = currentModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(currentModalEl) : null;
        if (currentModal) currentModal.show();
      }, { passive: true });
      mercanciaEditClickBound = true;
    }
    renderMercancia(); buscador("buscadorMercancia", "datatablesSimple"); mountTableTools("mercancia");
  }
  function renderMercancia() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.mercancia.map((m) => {
      const desc = splitMercanciaDesc(val(m, "descripcion"));
      return `<tr><td>${val(m, "fecha_recepcion", "fechaRecepcion") || "-"}</td><td>${val(m, "transportadora") || "-"}</td><td>${val(m, "remitente") || "-"}</td><td>${val(m, "cliente_destino", "clienteDestino") || "-"}</td><td>${desc.producto}</td><td>${fmtInt(val(m, "cantidad_cajas", "cantidad"))}</td><td>${money(val(m, "precio"))}</td><td>${desc.descripcion}</td><td>${val(m, "observaciones") || "-"}</td><td><button type="button" class="btn btn-sm btn-outline-primary edit-mercancia-btn" data-id="${m.id}"><i class="fas fa-pen me-1"></i>Editar</button></td></tr>`;
    }).join("");
    if (q("#mercancia")) q("#mercancia").textContent = fmtInt(st.mercancia.length);
  }

  async function modCartera() {
    await load("ventas");
    const tb = q("#carteraTabla"), msg = q("#mensajeVacio");
    const buscador = q("#buscadorCartera"), filtroSaldo = q("#filtroSaldo"), filtroModo = q("#filtroModoCartera"), btnExportar = q("#btnExportarCartera");
    if (!tb) return;

    const base = st.ventas.map((v) => {
      const total = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
      const ab = Number(val(v, "abono") || 0);
      return { ...v, total, ab, saldo: total - ab };
    });

    const applyFilters = () => {
      const term = String(buscador?.value || "").toLowerCase().trim();
      const saldoRule = String(filtroSaldo?.value || "todos");
      const modo = String(filtroModo?.value || "pendientes");
      return base.filter((c) => {
        const hayTexto = !term || [val(c, "cliente"), val(c, "producto"), val(c, "descripcion", "referencia"), val(c, "numero_pedido", "numeroPedido"), val(c, "numero_recibo", "numeroRecibo"), val(c, "numero_cartera", "numeroCartera")]
          .join(" ").toLowerCase().includes(term);
        const cumpleModo = modo === "abonos" ? c.ab > 0 : c.saldo > 0;
        let haySaldo = true;
        if (saldoRule === "mayor-1000") haySaldo = c.saldo > 1000;
        else if (saldoRule === "mayor-500") haySaldo = c.saldo > 500;
        else if (saldoRule === "menor-500") haySaldo = c.saldo <= 500;
        return hayTexto && haySaldo && cumpleModo;
      });
    };

    const renderFiltered = () => {
      const cart = applyFilters();
      const modo = String(filtroModo?.value || "pendientes");
      const soloVisual = modo === "abonos";
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
      tb.innerHTML = cart.map((c, i) => {
        const acciones = soloVisual
          ? '<span class="text-muted small">Solo visual</span>'
          : `<div class="d-flex flex-column flex-md-row gap-2"><input type="number" class="abono-input form-control form-control-sm" min="0.01" step="0.01" data-i="${i}" placeholder="Valor"><input type="text" class="abono-cartera-input form-control form-control-sm" data-i="${i}" placeholder="No. cartera"><button class="btn btn-success btn-sm abonar-btn" data-id="${c.id}" data-i="${i}">Abonar</button></div>`;
        return `<tr><td>${val(c, "cliente") || "-"}</td><td>${val(c, "producto") || "-"}</td><td>${val(c, "descripcion", "referencia") || "-"}</td><td>${val(c, "fecha") || "-"}</td><td>${val(c, "numero_pedido", "numeroPedido") || "-"}</td><td>${val(c, "numero_cartera", "numeroCartera") || "-"}</td><td>${money(c.total)}</td><td>${money(c.ab)}</td><td>${money(c.saldo)}</td><td>${acciones}</td></tr>`;
      }).join("");
      const total = cart.reduce((s, c) => s + c.saldo, 0);
      const clientes = new Set(cart.map((c) => val(c, "cliente") || "")).size;
      if (q("#totalCartera")) q("#totalCartera").textContent = money(total);
      if (q("#clientesActivos")) q("#clientesActivos").textContent = fmtInt(clientes);
      if (q("#promedioCliente")) q("#promedioCliente").textContent = money(clientes ? total / clientes : 0);
      if (q("#totalRegistros")) q("#totalRegistros").textContent = `${fmtInt(cart.length)} registros`;
      if (soloVisual) return;

      document.querySelectorAll(".abonar-btn").forEach((b) => b.onclick = async function () {
        const i = Number(this.dataset.i);
        const id = this.dataset.id;
        const inp = document.querySelector(`input.abono-input[data-i="${i}"]`);
        const carteraInp = document.querySelector(`input.abono-cartera-input[data-i="${i}"]`);
        const abono = Number(inp?.value || 0);
        const numeroCartera = txt(carteraInp?.value);
        if (!abono || abono <= 0) return alertx("Ingresa un abono valido", "warning");
        if (abono > cart[i].saldo) return alertx("El abono supera el saldo", "warning");
        if (!numeroCartera) return alertx("Ingresa numero de cartera para el abono", "warning");
        try {
          await upd("ventas", id, { abono: cart[i].ab + abono, total: cart[i].total, numero_cartera: numeroCartera });
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
    if (filtroModo && !filtroModo.dataset.bound) {
      filtroModo.addEventListener("change", renderFiltered);
      filtroModo.dataset.bound = "1";
    }
    if (btnExportar && !btnExportar.dataset.bound) {
      btnExportar.addEventListener("click", () => {
        const cart = applyFilters();
        if (!cart.length) return alertx("No hay datos para exportar", "warning");
        const rows = [["Cliente", "Producto", "Descripcion", "Fecha", "Numero Pedido Venta", "Numero Cartera", "Total", "Abono", "Saldo"]];
        cart.forEach((c) => {
          rows.push([
          val(c, "cliente") || "",
          val(c, "producto") || "",
          val(c, "descripcion", "referencia") || "",
          val(c, "fecha") || "",
          val(c, "numero_pedido", "numeroPedido") || "",
          val(c, "numero_cartera", "numeroCartera") || "",
          String(c.total),
          String(c.ab),
          String(c.saldo)
          ]);
        });
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
    mountTableTools("cartera");
  }

  async function modDashboard() {
    await Promise.all([load("ventas"), load("mercancia"), load("gastos")]);
    const ventas = st.ventas || [];
    const ingresos = ventas.reduce((s, v) => s + Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0), 0);
    const deuda = ventas.reduce((s, v) => {
      const t2 = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
      return s + Math.max(t2 - Number(val(v, "abono") || 0), 0);
    }, 0);
    const ticketProm = ventas.length ? ingresos / ventas.length : 0;
    if (q("#dashIngresos")) q("#dashIngresos").textContent = money(ingresos);
    if (q("#dashVentas")) q("#dashVentas").textContent = fmtInt(ventas.length);
    if (q("#dashCartera")) q("#dashCartera").textContent = money(deuda);
    if (q("#dashTicketPromedio")) q("#dashTicketPromedio").textContent = money(ticketProm);

    const porMes = {};
    ventas.forEach((v) => {
      const f = String(val(v, "fecha") || "").slice(0, 7) || "Sin fecha";
      porMes[f] = (porMes[f] || 0) + Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
    });
    const prodTop = {};
    ventas.forEach((v) => {
      const p = canonProducto(val(v, "producto"));
      prodTop[p] = (prodTop[p] || 0) + Number(val(v, "cantidad") || 0);
    });
    const topEntries = Object.entries(prodTop).sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (charts.ventasMes) charts.ventasMes.destroy();
    if (charts.productosTop) charts.productosTop.destroy();
    if (charts.carteraEstado) charts.carteraEstado.destroy();
    if (window.Chart && q("#chartVentasMes")) {
      charts.ventasMes = new window.Chart(q("#chartVentasMes"), {
        type: "line",
        data: {
          labels: Object.keys(porMes),
          datasets: [{ label: "Ingresos", data: Object.values(porMes), borderColor: "#1d4ed8", backgroundColor: "rgba(29,78,216,0.15)", fill: true, tension: 0.25 }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
    const ventasPagadas = ventas.filter((v) => {
      const total = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
      return Number(val(v, "abono") || 0) >= total;
    }).length;
    const ventasPend = Math.max(ventas.length - ventasPagadas, 0);
    if (window.Chart && q("#chartCarteraEstado")) {
      charts.carteraEstado = new window.Chart(q("#chartCarteraEstado"), {
        type: "doughnut",
        data: { labels: ["Pagadas", "Pendientes"], datasets: [{ data: [ventasPagadas, ventasPend], backgroundColor: ["#15803d", "#d97706"] }] },
        options: { responsive: true, plugins: { legend: { position: "bottom" } } }
      });
    }
    if (window.Chart && q("#chartProductosTop")) {
      charts.productosTop = new window.Chart(q("#chartProductosTop"), {
        type: "bar",
        data: {
          labels: topEntries.map((x) => x[0]),
          datasets: [{ data: topEntries.map((x) => x[1]), backgroundColor: "#0369a1" }]
        },
        options: { indexAxis: "y", responsive: true, plugins: { legend: { display: false } } }
      });
    }
    const carteraRows = ventas.map((v) => {
      const total = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
      const saldo = total - Number(val(v, "abono") || 0);
      return { cliente: val(v, "cliente") || "-", producto: val(v, "producto") || "-", saldo, fecha: val(v, "fecha") || "-" };
    }).filter((x) => x.saldo > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 8);
    const tb = q("#dashTopClientes");
    if (tb) tb.innerHTML = carteraRows.length
      ? carteraRows.map((r) => `<tr><td>${r.cliente}</td><td>${r.producto}</td><td>${money(r.saldo)}</td><td>${r.fecha}</td></tr>`).join("")
      : '<tr><td colspan="4" class="text-center text-muted">Sin deudas registradas</td></tr>';
    const hist = JSON.parse(localStorage.getItem("historial_cambios") || "[]").slice(0, 8);
    const ul = q("#dashHistorial");
    if (ul) ul.innerHTML = hist.length
      ? hist.map((h) => `<li class="list-group-item px-0"><div class="small text-muted">${String(h.at || "").slice(0, 16).replace("T", " ")}</div><div><span class="badge bg-light text-dark me-2">${h.module || "-"}</span>${h.action || "-"}</div></li>`).join("")
      : '<li class="list-group-item px-0 text-muted">Sin actividad reciente</li>';
  }

  function showDay() {
    const h = today();
    if (vistActual === "ventas") {
      const rows = st.ventas.filter((x) => asDay(val(x, "fecha")) === h).map((x) => `<tr><td>${val(x, "fecha") || "-"}</td><td>${val(x, "producto") || "-"}</td><td>${money(Number(val(x, "cantidad") || 0) * Number(val(x, "precio") || 0))}</td></tr>`).join("") || '<tr><td colspan="3" class="text-center">No hay ventas para hoy</td></tr>';
      if (q("#ventasDiaBody")) q("#ventasDiaBody").innerHTML = rows; if (q("#tablaVentas")) q("#tablaVentas").style.display = "none"; if (q("#ventasDia")) q("#ventasDia").style.display = "";
    }
    if (vistActual === "instalacion") {
      const rows = st.instalacion.filter((x) => asDay(val(x, "fecha_entrega", "fechaEntrega")) === h).map((x) => `<tr><td>${val(x, "estado") || "-"}</td><td>${val(x, "instalador") || "-"}</td><td>${val(x, "cliente") || "-"}</td><td>${val(x, "telefono") || "-"}</td><td>${val(x, "producto") || "-"}</td><td>${fmtInt(val(x, "cantidad"))}</td><td>${val(x, "ubicacion") || "-"}</td><td>${val(x, "fecha_entrega", "fechaEntrega") || "-"}</td><td>${val(x, "observaciones") || "-"}</td></tr>`).join("") || '<tr><td colspan="9" class="text-center">No hay instalaciones para hoy</td></tr>';
      if (q("#instalacionDiaBody")) q("#instalacionDiaBody").innerHTML = rows; if (q("#tablaInstalacion")) q("#tablaInstalacion").style.display = "none"; if (q("#instalacionDia")) q("#instalacionDia").style.display = "";
    }
    if (vistActual === "gastos") {
      const rows = st.gastos.filter((x) => asDay(val(x, "fecha_hora", "fechaHora")) === h).map((x) => `<tr><td>${tipoGasto(val(x, "tipo"))}</td><td>${money(val(x, "monto"))}</td><td>${val(x, "fecha_hora", "fechaHora") || "-"}</td><td>${val(x, "descripcion") || "-"}</td></tr>`).join("") || '<tr><td colspan="4" class="text-center">No hay gastos para hoy</td></tr>';
      if (q("#gastosDiaBody")) q("#gastosDiaBody").innerHTML = rows; if (q("#tablaGastos")) q("#tablaGastos").style.display = "none"; if (q("#gastosDia")) q("#gastosDia").style.display = "";
    }
    if (vistActual === "mercancia") {
      const rows = st.mercancia.filter((x) => asDay(val(x, "fecha_recepcion", "fechaRecepcion")) === h).map((x) => {
        const desc = splitMercanciaDesc(val(x, "descripcion"));
        return `<tr><td>${val(x, "fecha_recepcion", "fechaRecepcion") || "-"}</td><td>${val(x, "transportadora") || "-"}</td><td>${val(x, "remitente") || "-"}</td><td>${val(x, "cliente_destino", "clienteDestino") || "-"}</td><td>${desc.producto}</td><td>${fmtInt(val(x, "cantidad_cajas", "cantidad"))}</td><td>${money(val(x, "precio"))}</td><td>${desc.descripcion}</td><td>${val(x, "observaciones") || "-"}</td></tr>`;
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

  const views = { dashboard: "Dashboard Empresarial", ventas: "Registro de Ventas", instalacion: "Reporte de Instalacion", mercancia: "Reporte de Mercancia", gastos: "Reporte de Gastos", cartera: "Cartera de Clientes" };
  const links = document.querySelectorAll(".nav-link"), title = q("#viewTitle");
  async function init(v) { showAll(); if (v === "dashboard") await modDashboard(); else if (v === "ventas") await modVentas(); else if (v === "instalacion") await modInst(); else if (v === "gastos") await modGastos(); else if (v === "mercancia") await modMercancia(); else if (v === "cartera") await modCartera(); }
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
  change("dashboard");
});
