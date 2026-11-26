(function () {
  "use strict";

  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const TIPO_NOME = { dossie: "Dossiê", special: "Special issue / monográfico", proposta: "Proposta de dossiê", livro: "Edital de livro", capitulos: "Chamada de capítulos" };
  const QUALIS_ORDEM = { A1: 1, A2: 2, A3: 3, A4: 4, B1: 5, B2: 6, B3: 7, B4: 8, C: 9 };
  const SUCUPIRA = "https://sucupira.capes.gov.br/avaliacao-quadrienal/qualis-periodico";

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const $ = (s) => document.querySelector(s);
  const parse = (iso) => { if (!iso) return null; const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); };
  const dias = (d) => Math.round((d - hoje) / 86400000);
  const fmt = (iso) => { const d = parse(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Só chamadas abertas: prazo a partir de hoje, ou fluxo contínuo
  const abertas = CHAMADAS.filter((c) => !c.prazo || parse(c.prazo) >= hoje);
  abertas.forEach((c) => {
    c._prazo = parse(c.prazo);
    c._abertura = parse(c.abertura);
    c._tipoGrupo = c.tipo === "capitulos" ? "livro" : c.tipo;
    c._texto = semAcento([c.periodico, c.instituicao, c.titulo, c.organizacao, c.sintese, c.criterios, (c.areas || []).join(" "), c.pais].join(" "));
    // Considera "sem custo conhecido": sem taxa informada/mencionada, sem taxas, ou modelo por assinatura
    c._gratis = /sem tax|assinatura/i.test(c.apc || "");
  });

  const estado = { mes: null };

  // ── Régua de prazos ──
  function montarRegua() {
    const regua = $("#regua");
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const nMeses = 10;
    const fim = new Date(inicio.getFullYear(), inicio.getMonth() + nMeses, 1);
    regua.innerHTML = "";
    for (let i = 0; i < nMeses; i++) {
      const m0 = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      const m1 = new Date(inicio.getFullYear(), inicio.getMonth() + i + 1, 1);
      const chave = `${m0.getFullYear()}-${m0.getMonth()}`;
      const doMes = abertas.filter((c) => c._prazo && c._prazo >= m0 && c._prazo < m1);
      const b = document.createElement("button");
      b.type = "button"; b.className = "mes"; b.dataset.mes = chave;
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", `${MESES_LONGO[m0.getMonth()]} de ${m0.getFullYear()}: ${doMes.length} prazos`);
      const total = (m1 - m0);
      // empilha traços do mesmo dia
      const pilha = {};
      doMes.forEach((c, idx) => {
        const k = c.prazo; pilha[k] = (pilha[k] || 0) + 1;
        const t = document.createElement("span");
        t.className = `traco ${c.escopo}`;
        t.style.left = `${((c._prazo - m0) / total) * 100}%`;
        t.style.marginLeft = `${(pilha[k] - 1) * 3}px`;
        t.style.height = `${Math.min(60, 22 + pilha[k] * 8)}px`;
        t.style.animationDelay = `${idx * 25}ms`;
        b.appendChild(t);
      });
      if (hoje >= m0 && hoje < m1) {
        const h = document.createElement("span");
        h.className = "hoje"; h.style.left = `${((hoje - m0) / total) * 100}%`;
        b.appendChild(h);
      }
      const rot = document.createElement("span");
      rot.className = "mes-rotulo";
      rot.innerHTML = `${MESES[m0.getMonth()]}${m0.getMonth() === 0 || i === 0 ? " " + String(m0.getFullYear()).slice(2) : ""}<span class="mes-n">${doMes.length || ""}</span>`;
      b.appendChild(rot);
      b.addEventListener("click", () => {
        estado.mes = estado.mes === chave ? null : chave;
        regua.querySelectorAll(".mes").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mes === estado.mes)));
        render();
      });
      regua.appendChild(b);
    }
    const depois = abertas.filter((c) => c._prazo && c._prazo >= fim).length;
    const continuo = abertas.filter((c) => !c._prazo).length;
    $(".regua-dica").innerHTML =
      `Cada traço é um prazo<span class="legenda-cor" style="background:#8fb0ff"></span>nacional<span class="legenda-cor" style="background:#5fd3c6"></span>internacional. Clique num mês para ver só as chamadas que fecham nele.` +
      (depois ? ` Mais ${depois} fecham depois deste período.` : "") +
      (continuo ? ` ${continuo} em fluxo contínuo.` : "");
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

  function filtrar(f) {
    let r = abertas.filter((c) => {
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
      if (estado.mes) {
        if (!c._prazo) return false;
        if (`${c._prazo.getFullYear()}-${c._prazo.getMonth()}` !== estado.mes) return false;
      }
      if (f.busca) {
        return f.busca.split(/\s+/).every((t) => c._texto.includes(t));
      }
      return true;
    });
    const big = 8.64e15;
    const ord = {
      prazo: (a, b) => (a._prazo || big) - (b._prazo || big),
      "prazo-desc": (a, b) => (b._prazo || 0) - (a._prazo || 0),
      qualis: (a, b) => (QUALIS_ORDEM[a.qualis] || 99) - (QUALIS_ORDEM[b.qualis] || 99) || (a._prazo || big) - (b._prazo || big),
      periodico: (a, b) => a.periodico.localeCompare(b.periodico, "pt")
    };
    return r.sort(ord[f.ordem]);
  }

  // ── Renderização ──
  function classePrazo(c) {
    if (!c._prazo) return "continuo";
    const d = dias(c._prazo);
    return d <= 15 ? "urgente" : d <= 45 ? "breve" : "folga";
  }
  function textoFalta(c) {
    if (!c._prazo) return "fluxo contínuo";
    const d = dias(c._prazo);
    if (d === 0) return "fecha hoje";
    if (d === 1) return "fecha amanhã";
    return `faltam ${d} dias`;
  }

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
      c.qualis ? ["Qualis", `${c.qualis} (${c.qualisNota || "fonte citada"})`] : ["Qualis", "Não informado na fonte; consulte a Sucupira"],
      c.indicador ? ["Indicador", c.indicador] : null,
      c.issn ? ["ISSN", c.issn] : null,
      ["Instituição e país", `${c.instituicao}, ${c.pais}`],
      ["Fonte", `${c.fonte}. Conferido em ${fmt(c.verificado)}.`]
    ].filter(Boolean);
    return `<div class="detalhe"><p>${esc(c.sintese)}</p><dl>${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div>`;
  }

  function selos(c) {
    const s = [];
    s.push(`<li class="selo ${c.escopo}">${c.escopo === "nacional" ? "Nacional" : "Internacional"}</li>`);
    s.push(`<li class="selo">${TIPO_NOME[c.tipo]}</li>`);
    if (c.qualis) s.push(`<li class="selo qualis" title="${esc(c.qualisNota || "")}">Qualis ${esc(c.qualis)}</li>`);
    if (c.indicador) s.push(`<li class="selo">${esc(c.indicador)}</li>`);
    if (!c._gratis) s.push(`<li class="selo taxa">Taxa: ${esc(c.apc)}</li>`);
    (c.areas || []).slice(0, 3).forEach((a) => s.push(`<li class="selo">${esc(a)}</li>`));
    return `<ul class="selos">${s.join("")}</ul>`;
  }

  function acoes(c) {
    const livro = c._tipoGrupo === "livro";
    return `<div class="acoes">
      <a class="principal" href="${esc(c.link)}" target="_blank" rel="noopener">Abrir chamada original</a>
      <a href="#/chamada/${esc(c.id)}">Ver ficha</a>
      ${c.prazo ? `<button type="button" data-ics="${esc(c.id)}">Adicionar à agenda</button>` : ""}
      ${!livro && c.escopo === "nacional" ? `<a href="${SUCUPIRA}" target="_blank" rel="noopener">Consultar Qualis</a>` : ""}
      ${!livro && c.escopo === "internacional" ? `<a href="https://www.scimagojr.com/journalsearch.php?q=${encodeURIComponent(c.periodico.split(":")[0].split(".")[0])}" target="_blank" rel="noopener">Ver no SCImago</a>` : ""}
      <button type="button" data-copiar="${esc(c.id)}">Copiar link</button>
    </div>`;
  }

  function itemHTML(c) {
    const cl = classePrazo(c);
    const d = c._prazo;
    const abreDepois = c._abertura && c._abertura > hoje;
    return `<li class="chamada ${cl}" id="c-${esc(c.id)}">
      <div class="prazo">
        ${d ? `<div class="prazo-dia">${String(d.getDate()).padStart(2, "0")}</div><div class="prazo-mes">${MESES_LONGO[d.getMonth()]} ${d.getFullYear()}</div>` : `<div class="prazo-mes">sem data final</div>`}
        <span class="prazo-falta">${textoFalta(c)}</span>
        ${abreDepois ? `<span class="prazo-abre">recebe a partir de ${fmt(c.abertura)}</span>` : ""}
      </div>
      <div>
        <p class="revista"><b>${esc(c.periodico)}</b>, ${esc(c.instituicao)}</p>
        <h3>${esc(c.titulo)}</h3>
        ${selos(c)}
        <details><summary>Síntese e critérios</summary>${blocoDetalhe(c)}</details>
        ${acoes(c)}
      </div>
    </li>`;
  }

  let ultimo = [];
  function render() {
    const f = lerFiltros();
    ultimo = filtrar(f);
    $("#chamadas").innerHTML = ultimo.map(itemHTML).join("");
    $("#vazio").hidden = ultimo.length > 0;
    const nac = ultimo.filter((c) => c.escopo === "nacional").length;
    const mesTxt = estado.mes ? (() => { const [a, m] = estado.mes.split("-").map(Number); return ` com prazo em ${MESES_LONGO[m]} de ${a}`; })() : "";
    $("#resumo").textContent = `${ultimo.length} ${ultimo.length === 1 ? "chamada" : "chamadas"}${mesTxt}: ${nac} nacionais e ${ultimo.length - nac} internacionais.`;
  }

  function status() {
    const proximas = abertas.filter((c) => c._prazo && dias(c._prazo) <= 15).length;
    const [a, m, d] = ATUALIZADO_EM.split("-");
    $("#status").innerHTML = `<strong>${abertas.length} chamadas abertas</strong><br>${proximas} fecham nos próximos 15 dias<br>Levantamento atualizado em ${d}/${m}/${a}`;
  }

  // ── Ficha (rota #/chamada/id) ──
  const dlg = $("#ficha");
  function abrirFicha() {
    const m = location.hash.match(/^#\/chamada\/(.+)$/);
    if (!m) { if (dlg.open) dlg.close(); return; }
    const c = CHAMADAS.find((x) => x.id === decodeURIComponent(m[1]));
    if (!c) return;
    if (!c._prazo && c.prazo) { c._prazo = parse(c.prazo); }
    const vencida = c.prazo && parse(c.prazo) < hoje;
    $("#ficha-corpo").innerHTML = `
      <p class="revista"><b>${esc(c.periodico)}</b>, ${esc(c.instituicao)}</p>
      <h2 id="ficha-titulo">${esc(c.titulo)}</h2>
      ${vencida ? `<p><strong>Esta chamada já encerrou em ${fmt(c.prazo)}.</strong></p>` : ""}
      ${blocoDetalhe(c)}
      <div class="acoes" style="margin-top:1rem"><a class="principal" href="${esc(c.link)}" target="_blank" rel="noopener">Abrir chamada original</a></div>`;
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener("close", () => {
    if (location.hash.startsWith("#/chamada/")) history.replaceState(null, "", location.pathname + location.search);
  });
  window.addEventListener("hashchange", abrirFicha);

  // ── Agenda (.ics) ──
  function baixar(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function ics(c) {
    const d = c.prazo.replace(/-/g, "");
    const fim = parse(c.prazo); fim.setDate(fim.getDate() + 1);
    const d2 = `${fim.getFullYear()}${String(fim.getMonth() + 1).padStart(2, "0")}${String(fim.getDate()).padStart(2, "0")}`;
    const limpa = (s) => String(s).replace(/[,;\\]/g, (x) => "\\" + x).replace(/\n/g, " ");
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Próximo Número//PT-BR", "BEGIN:VEVENT",
      `UID:${c.id}@proximo-numero`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
      `SUMMARY:${limpa("Prazo: " + c.periodico + " – " + c.titulo)}`,
      `DESCRIPTION:${limpa(c.link)}`, `URL:${c.link}`,
      "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:Falta uma semana para o prazo", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ics]");
    if (b) { const c = abertas.find((x) => x.id === b.dataset.ics); baixar(`prazo-${c.id}.ics`, ics(c), "text/calendar"); return; }
    const cp = e.target.closest("[data-copiar]");
    if (cp) {
      const url = `${location.origin}${location.pathname}#/chamada/${cp.dataset.copiar}`;
      navigator.clipboard?.writeText(url).then(() => { cp.textContent = "Link copiado"; setTimeout(() => (cp.textContent = "Copiar link"), 1800); });
    }
  });

  // ── CSV ──
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

  function limpar() {
    $("#form-filtros").reset();
    estado.mes = null;
    document.querySelectorAll(".mes").forEach((x) => x.setAttribute("aria-pressed", "false"));
    render();
  }

  // ── Início ──
  preencherAreas();
  montarRegua();
  status();
  $("#form-filtros").addEventListener("input", render);
  $("#form-filtros").addEventListener("change", render);
  $("#limpar").addEventListener("click", limpar);
  $("#limpar2").addEventListener("click", limpar);
  $("#exportar").addEventListener("click", csv);
  render();
  abrirFicha();
})();
