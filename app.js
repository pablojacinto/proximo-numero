(function () {
  "use strict";

  const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const TIPO_NOME = { dossie: "Dossiê", special: "Special issue", proposta: "Proposta de dossiê", livro: "Edital de livro", capitulos: "Chamada de capítulos" };
  const QUALIS_ORDEM = { A1: 1, A2: 2, A3: 3, A4: 4, B1: 5, B2: 6, B3: 7, B4: 8, C: 9 };
  const SUCUPIRA = "https://sucupira.capes.gov.br/avaliacao-quadrienal/qualis-periodico";

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const $ = (s) => document.querySelector(s);
  const parse = (iso) => { if (!iso) return null; const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
  const dias = (d) => Math.round((d - hoje) / 86400000);
  const fmt = (iso) => { const d = parse(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const chaveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  // Só chamadas abertas: prazo a partir de hoje, ou fluxo contínuo
  const abertas = CHAMADAS.filter((c) => !c.prazo || parse(c.prazo) >= hoje);
  abertas.forEach((c) => {
    c._prazo = parse(c.prazo);
    c._abertura = parse(c.abertura);
    c._tipoGrupo = c.tipo === "capitulos" ? "livro" : c.tipo;
    c._gratis = /sem tax|assinatura/i.test(c.apc || "");
    c._texto = semAcento([c.periodico, c.instituicao, c.titulo, c.organizacao, c.sintese, c.criterios, (c.areas || []).join(" "), c.pais].join(" "));
  });

  const estado = { mes: null };

  function urgencia(c) {
    if (!c._prazo) return "continuo";
    const d = dias(c._prazo);
    return d <= 15 ? "urgente" : d <= 45 ? "breve" : "folga";
  }
  function textoFalta(c) {
    if (!c._prazo) return "Fluxo contínuo";
    const d = dias(c._prazo);
    if (d === 0) return "Fecha hoje";
    if (d === 1) return "Fecha amanhã";
    return `Faltam ${d} dias`;
  }
  function folhinha(c) {
    if (!c._prazo) return `<div class="folhinha" aria-hidden="true"><span class="fm">sem prazo</span><span class="fd">fluxo contínuo</span></div>`;
    const d = c._prazo;
    return `<div class="folhinha" aria-hidden="true"><span class="fm">${MES_CURTO[d.getMonth()]}</span><span class="fd">${d.getDate()}</span><span class="fa">${d.getFullYear()}</span></div>`;
  }

  // ── Filtros ──
  function preencherAreas() {
    const set = new Set();
    abertas.forEach((c) => (c.areas || []).forEach((a) => set.add(a)));
    const sel = $("#f-area");
    [...set].sort((a, b) => a.localeCompare(b, "pt")).forEach((a) => {
      const o = document.createElement("option"); o.value = a; o.textContent = a; sel.appendChild(o);
    });
  }

  function lerFiltros() {
    return {
      busca: semAcento($("#f-busca").value.trim()),
      escopo: document.querySelector('input[name="escopo"]:checked').value,
      tipos: [...document.querySelectorAll('input[name="tipo"]:checked')].map((i) => i.value),
      area: $("#f-area").value,
      qualis: $("#f-qualis").value,
      prazo: $("#f-prazo").value,
      gratis: $("#f-gratis").checked,
      jaAbertas: $("#f-abertas").checked,
      ordem: $("#f-ordem").value
    };
  }

  function passa(c, f, ignorarMes) {
    if (f.escopo && c.escopo !== f.escopo) return false;
    if (!f.tipos.includes(c._tipoGrupo)) return false;
    if (f.area && !(c.areas || []).includes(f.area)) return false;
    if (f.qualis) {
      const q = QUALIS_ORDEM[c.qualis];
      if (f.qualis === "sem" && c.qualis) return false;
      if (f.qualis === "A1" && c.qualis !== "A1") return false;
      if (f.qualis === "A1-A2" && !(q && q <= 2)) return false;
      if (f.qualis === "A1-A4" && !(q && q <= 4)) return false;
    }
    if (f.prazo) {
      if (!c._prazo) return false;
      const d = dias(c._prazo);
      if (f.prazo === "longo" ? d <= 90 : d > Number(f.prazo)) return false;
    }
    if (f.gratis && !c._gratis) return false;
    if (f.jaAbertas && c._abertura && c._abertura > hoje) return false;
    if (!ignorarMes && estado.mes) {
      if (estado.mes === "continuo") { if (c._prazo) return false; }
      else if (!c._prazo || chaveMes(c._prazo) !== estado.mes) return false;
    }
    if (f.busca && !f.busca.split(/\s+/).every((t) => c._texto.includes(t))) return false;
    return true;
  }

  function ordenar(lista, ordem) {
    const big = 8.64e15;
    const fns = {
      prazo: (a, b) => (a._prazo || big) - (b._prazo || big),
      "prazo-desc": (a, b) => (b._prazo || 0) - (a._prazo || 0),
      qualis: (a, b) => (QUALIS_ORDEM[a.qualis] || 99) - (QUALIS_ORDEM[b.qualis] || 99) || (a._prazo || big) - (b._prazo || big),
      periodico: (a, b) => a.periodico.localeCompare(b.periodico, "pt")
    };
    return lista.sort(fns[ordem]);
  }

  // ── Meses ──
  function renderMeses(f) {
    const base = abertas.filter((c) => passa(c, f, true));
    const cont = {};
    base.forEach((c) => { const k = c._prazo ? chaveMes(c._prazo) : "continuo"; cont[k] = (cont[k] || 0) + 1; });
    const chaves = Object.keys(cont).filter((k) => k !== "continuo").sort();
    if (cont.continuo) chaves.push("continuo");
    const botao = (k, rotulo, n) =>
      `<button type="button" class="mes" data-mes="${k}" aria-pressed="${estado.mes === k}">${rotulo}${n !== null ? `<b>${n}</b>` : ""}</button>`;
    let html = botao("", "Todos os meses", base.length).replace(`aria-pressed="${estado.mes === ""}"`, `aria-pressed="${!estado.mes}"`);
    chaves.forEach((k) => {
      if (k === "continuo") { html += botao(k, "Fluxo contínuo", cont[k]); return; }
      const [a, m] = k.split("-").map(Number);
      const rot = `${MES_CURTO[m - 1]}${a !== hoje.getFullYear() ? " " + a : ""}`;
      html += botao(k, rot, cont[k]);
    });
    $("#meses").innerHTML = html;
  }

  // ── Itens ──
  function blocoDetalhe(c) {
    const linhas = [
      ["Organização", c.organizacao],
      ["Critérios", c.criterios],
      c.prazoNota ? ["Sobre o prazo", c.prazoNota] : null,
      c.abertura ? ["Abertura", fmt(c.abertura)] : null,
      ["Prazo final", c.prazo ? fmt(c.prazo) : "Fluxo contínuo"],
      c.publicacao ? ["Publicação", c.publicacao] : null,
      ["Idiomas", c.idiomas],
      c.quemPode ? ["Quem pode submeter", c.quemPode] : null,
      ["Taxas", c.apc],
      ["Qualis", c.qualis ? `${c.qualis} (${c.qualisNota || "fonte citada"})` : "Não informado na fonte; consulte a Sucupira"],
      c.indicador ? ["Indicador", c.indicador] : null,
      c.issn ? ["ISSN", c.issn] : null,
      ["Instituição e país", `${c.instituicao}, ${c.pais}`],
      ["Fonte", `${c.fonte}. Conferido em ${fmt(c.verificado)}.`]
    ].filter(Boolean);
    return `<div class="detalhe"><p>${esc(c.sintese)}</p><dl>${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
  }

  function meta(c) {
    const t = [];
    t.push(`<li class="tag falta-txt"><span class="falta">${textoFalta(c)}</span></li>`);
    if (c.qualis) t.push(`<li class="tag qualis" title="${esc(c.qualisNota || "")}">Qualis ${esc(c.qualis)}</li>`);
    if (c.indicador) t.push(`<li class="tag">${esc(c.indicador.replace(/\s*\(.*\)/, ""))}</li>`);
    t.push(`<li class="tag${c.escopo === "internacional" ? " int" : ""}">${c.escopo === "nacional" ? "Nacional" : "Internacional"}</li>`);
    t.push(`<li class="tag">${TIPO_NOME[c.tipo]}</li>`);
    if (c.areas && c.areas[0]) t.push(`<li class="tag">${esc(c.areas[0])}</li>`);
    if (!c._gratis) t.push(`<li class="tag taxa">Taxas: ${esc(c.apc.toLowerCase())}</li>`);
    if (c._abertura && c._abertura > hoje) t.push(`<li class="tag abre">Recebe a partir de ${fmt(c.abertura)}</li>`);
    return `<ul class="meta">${t.join("")}</ul>`;
  }

  function acoes(c) {
    const livro = c._tipoGrupo === "livro";
    const extra = livro ? "" : c.escopo === "nacional"
      ? `<a class="lk" href="${SUCUPIRA}" target="_blank" rel="noopener">Consultar Qualis</a>`
      : `<a class="lk" href="https://www.scimagojr.com/journalsearch.php?q=${encodeURIComponent(c.periodico.split(/[:.–]/)[0].trim())}" target="_blank" rel="noopener">Ver no SCImago</a>`;
    return `<div class="acoes">
      <a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener">Abrir chamada original</a>
      ${c.prazo ? `<button type="button" class="lk" data-ics="${esc(c.id)}">Adicionar à agenda</button>` : ""}
      ${extra}
      <button type="button" class="lk" data-copiar="${esc(c.id)}">Copiar link</button>
    </div>`;
  }

  function itemHTML(c) {
    return `<li class="chamada ${urgencia(c)}" id="c-${esc(c.id)}">
      ${folhinha(c)}
      <div class="info">
        <p class="rev"><b>${esc(c.periodico)}</b>, ${esc(c.instituicao)}</p>
        <h3>${esc(c.titulo)}</h3>
        ${meta(c)}
        <details class="det"><summary>Síntese e critérios</summary>${blocoDetalhe(c)}</details>
        ${acoes(c)}
      </div>
    </li>`;
  }

  function renderUrgentes() {
    const u = abertas.filter((c) => c._prazo && dias(c._prazo) <= 15).sort((a, b) => a._prazo - b._prazo);
    const sec = $(".urgentes");
    if (!u.length) { sec.hidden = true; return; }
    $("#urgentes").innerHTML = u.slice(0, 6).map((c) => {
      const d = c._prazo;
      return `<a class="urg-card" href="#/chamada/${esc(c.id)}">
        <div class="pills"><span class="pill u">${d.getDate()} ${MES_CURTO[d.getMonth()]}, ${textoFalta(c).toLowerCase()}</span>${c.qualis ? `<span class="pill">Qualis ${esc(c.qualis)}</span>` : ""}</div>
        <h3>${esc(c.titulo)}</h3><p>${esc(c.periodico)}</p></a>`;
    }).join("");
    $("#ver-urgentes").textContent = `Ver as ${u.length}`;
    $("#ver-urgentes").addEventListener("click", () => atalho("urgentes"));
  }

  function atalho(tipo) {
    limpar(true);
    if (tipo === "nacional" || tipo === "internacional") document.querySelector(`input[name="escopo"][value="${tipo}"]`).checked = true;
    if (tipo === "urgentes") $("#f-prazo").value = "15";
    if (tipo === "a1") $("#f-qualis").value = "A1";
    if (tipo === "livros") document.querySelectorAll('input[name="tipo"]').forEach((i) => (i.checked = i.value === "livro"));
    render();
    document.getElementById("lista").scrollIntoView();
  }

  let ultimo = [];
  function render() {
    const f = lerFiltros();
    renderMeses(f);
    ultimo = ordenar(abertas.filter((c) => passa(c, f)), f.ordem);
    const alvo = $("#chamadas");
    if (f.ordem === "prazo" || f.ordem === "prazo-desc") {
      const grupos = [];
      ultimo.forEach((c) => {
        const k = c._prazo ? chaveMes(c._prazo) : "continuo";
        let g = grupos[grupos.length - 1];
        if (!g || g.k !== k) { g = { k, itens: [] }; grupos.push(g); }
        g.itens.push(c);
      });
      alvo.innerHTML = grupos.map((g) => {
        let nome = "Fluxo contínuo";
        if (g.k !== "continuo") { const [a, m] = g.k.split("-").map(Number); nome = `${MES_LONGO[m - 1][0].toUpperCase() + MES_LONGO[m - 1].slice(1)} de ${a}`; }
        return `<section class="grupo"><h2>${nome}<span>${g.itens.length} ${g.itens.length === 1 ? "chamada" : "chamadas"}</span></h2><ol class="lista">${g.itens.map(itemHTML).join("")}</ol></section>`;
      }).join("");
    } else {
      alvo.innerHTML = `<section class="grupo"><ol class="lista">${ultimo.map(itemHTML).join("")}</ol></section>`;
    }
    $("#vazio").hidden = ultimo.length > 0;
    const nac = ultimo.filter((c) => c.escopo === "nacional").length;
    $("#resumo").textContent = `${ultimo.length} ${ultimo.length === 1 ? "chamada encontrada" : "chamadas encontradas"}: ${nac} nacionais e ${ultimo.length - nac} internacionais.`;
  }

  function numeros() {
    const nac = abertas.filter((c) => c.escopo === "nacional").length;
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    set("t-total", abertas.length);
    set("t-nac", nac);
    set("t-int", abertas.length - nac);
    set("t-urg", abertas.filter((c) => c._prazo && dias(c._prazo) <= 15).length);
    set("t-a1", abertas.filter((c) => c.qualis === "A1").length);
    set("t-liv", abertas.filter((c) => c._tipoGrupo === "livro").length);
    document.querySelectorAll("[data-atalho]").forEach((b) => b.addEventListener("click", () => atalho(b.dataset.atalho)));
    const [a, m, d] = ATUALIZADO_EM.split("-");
    $("#atualizacao").innerHTML = `<strong>Última atualização: ${d}/${m}/${a}.</strong> A lista é revisada toda segunda-feira, e cada chamada é conferida na página oficial uma vez por mês.`;
  }

  // ── Ficha (#/chamada/id) ──
  const dlg = $("#ficha");
  function abrirFicha() {
    const m = location.hash.match(/^#\/chamada\/(.+)$/);
    if (!m) { if (dlg.open) dlg.close(); return; }
    const c = CHAMADAS.find((x) => x.id === decodeURIComponent(m[1]));
    if (!c) return;
    if (c.prazo && !c._prazo) c._prazo = parse(c.prazo);
    const vencida = c.prazo && parse(c.prazo) < hoje;
    $("#ficha-corpo").innerHTML = `
      <div class="ficha-topo ${urgencia(c)}">${folhinha(c)}
        <div><p class="rev" style="margin:0;color:var(--tinta-3)">${esc(c.periodico)}, ${esc(c.instituicao)}</p>
        <h2 id="ficha-titulo">${esc(c.titulo)}</h2>
        ${vencida ? `<p><strong>Esta chamada encerrou em ${fmt(c.prazo)}.</strong></p>` : `<p class="falta" style="margin:8px 0 0">${c._prazo ? textoFalta(c) : "Fluxo contínuo"}</p>`}</div>
      </div>
      ${blocoDetalhe(c)}
      <div class="acoes"><a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener">Abrir chamada original</a></div>`;
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener("close", () => {
    if (location.hash.startsWith("#/chamada/")) history.replaceState(null, "", location.pathname + location.search);
  });
  window.addEventListener("hashchange", abrirFicha);

  // ── Agenda, link, CSV ──
  function baixar(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function ics(c) {
    const fim = parse(c.prazo); fim.setDate(fim.getDate() + 1);
    const d2 = `${fim.getFullYear()}${String(fim.getMonth() + 1).padStart(2, "0")}${String(fim.getDate()).padStart(2, "0")}`;
    const limpa = (s) => String(s).replace(/[,;\\]/g, (x) => "\\" + x).replace(/\n/g, " ");
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Proximo Numero//PT-BR", "BEGIN:VEVENT",
      `UID:${c.id}@proximo-numero`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${c.prazo.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${d2}`,
      `SUMMARY:${limpa("Prazo: " + c.periodico + " – " + c.titulo)}`, `DESCRIPTION:${limpa(c.link)}`, `URL:${c.link}`,
      "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:Falta uma semana para o prazo", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  }
  function csv() {
    const cols = [["Abrangência", "escopo"], ["Tipo", (c) => TIPO_NOME[c.tipo]], ["Revista/editora", "periodico"], ["Instituição", "instituicao"], ["País", "pais"],
      ["Título da chamada", "titulo"], ["Organização", "organizacao"], ["Áreas", (c) => (c.areas || []).join("; ")], ["Qualis", "qualis"], ["Indicador", "indicador"],
      ["Abertura", (c) => c.abertura ? fmt(c.abertura) : ""], ["Prazo", (c) => c.prazo ? fmt(c.prazo) : "Fluxo contínuo"], ["Publicação", "publicacao"],
      ["Idiomas", "idiomas"], ["Taxas", "apc"], ["Síntese", "sintese"], ["Critérios", "criterios"], ["Link", "link"], ["Fonte", "fonte"]];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [cols.map((c) => q(c[0])).join(";")];
    ultimo.forEach((c) => linhas.push(cols.map(([, k]) => q(typeof k === "function" ? k(c) : c[k])).join(";")));
    baixar("proximo-numero-chamadas.csv", "﻿" + linhas.join("\r\n"), "text/csv;charset=utf-8");
  }

  document.addEventListener("click", (e) => {
    const mes = e.target.closest(".mes");
    if (mes) { estado.mes = mes.dataset.mes || null; render(); return; }
    const b = e.target.closest("[data-ics]");
    if (b) { const c = abertas.find((x) => x.id === b.dataset.ics); baixar(`prazo-${c.id}.ics`, ics(c), "text/calendar"); return; }
    const cp = e.target.closest("[data-copiar]");
    if (cp) {
      const url = `${location.origin}${location.pathname}#/chamada/${cp.dataset.copiar}`;
      navigator.clipboard?.writeText(url).then(() => { cp.textContent = "Link copiado"; setTimeout(() => (cp.textContent = "Copiar link"), 1800); });
    }
  });

  function limpar(semRender) {
    $("#form-filtros").reset();
    $("#f-busca").value = "";
    estado.mes = null;
    if (semRender !== true) render();
  }

  // ── Voltar ao topo ──
  const topoBtn = document.getElementById("topo-btn");
  if (topoBtn) {
    const ver = () => { topoBtn.hidden = window.scrollY < 600; };
    window.addEventListener("scroll", ver, { passive: true });
    topoBtn.addEventListener("click", () => window.scrollTo({ top: 0 }));
    ver();
  }

  // ── Início ──
  if (window.matchMedia("(max-width: 1000px)").matches) $("#painel-filtros").open = false;
  preencherAreas();
  numeros();
  renderUrgentes();
  $("#form-filtros").addEventListener("input", render);
  $("#form-filtros").addEventListener("change", render);
  $("#f-busca").addEventListener("input", render);
  $("#limpar").addEventListener("click", () => limpar());
  $("#limpar2").addEventListener("click", () => limpar());
  $("#exportar").addEventListener("click", csv);
  render();
  abrirFicha();
})();
