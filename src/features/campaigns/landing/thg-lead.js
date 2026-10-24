/*
 * thg-lead.js — shared consult form for uploaded TH Group landing pages.
 *
 * Served by the CMS Worker at https://lp.thgfulfill.com/_thg/thg-lead.js and
 * injected as the FIRST script in <head> of every uploaded landing page. The
 * Worker prepends `window.__THG_LEAD__ = { endpoint, turnstileSiteKey }`.
 *
 * - Any click on [data-consult], a mailto: link, or a submit of a mailto: form
 *   opens the TH Group 2-step consult form instead (capture phase on window,
 *   so the page's own popup / mailto code never sees the click).
 * - The form mirrors the website's LeadFormDialog fields and POSTs the same
 *   JSON to the CMS public leads endpoint, tagged source_page "landing:<slug>".
 *
 * Plain browser JavaScript, no build step. Keep it dependency-free.
 */
(function () {
  "use strict";
  if (window.__THG_LEAD_LOADED__) return;
  window.__THG_LEAD_LOADED__ = true;

  var config = window.__THG_LEAD__ || {};
  var script = document.currentScript;
  var slug = (script && script.getAttribute("data-slug")) || "landing";
  var lang = (script && script.getAttribute("data-lang")) || document.documentElement.lang || "vi";
  lang = lang.slice(0, 2) === "vi" ? "vi" : "en";
  var endpoint = config.endpoint || "https://cms.thgfulfill.com/api/v1/leads";
  var siteKey = config.turnstileSiteKey || "";
  var OPEN_HASHES = ["#tu-van-ngay", "#thg-consult"];

  var T = {
    vi: {
      title: "Liên hệ tư vấn",
      lead: "Để lại thông tin, đội TH Group sẽ phản hồi trong 24h.",
      name: "Họ tên",
      email: "Email",
      store: "Company / store URL",
      service: "Dịch vụ chính",
      volume: "Số đơn mỗi tháng",
      phone: "Điện thoại (tuỳ chọn)",
      markets: "Thị trường giao hàng",
      message: "Nhu cầu (tuỳ chọn)",
      next: "Tiếp tục",
      back: "Quay lại",
      submit: "Gửi yêu cầu tư vấn",
      sending: "Đang gửi…",
      required: "Vui lòng điền đủ các trường có dấu *.",
      captcha: "Vui lòng xác minh bạn không phải robot.",
      fail: "Gửi chưa được, vui lòng thử lại sau ít phút.",
      done: "Cảm ơn bạn! Đội TH Group sẽ liên hệ lại trong vòng 24h.",
      close: "Đóng",
      consent: "Bằng cách gửi form, bạn đồng ý cho TH Group xử lý dữ liệu để liên hệ tư vấn.",
    },
    en: {
      title: "Talk to TH Group",
      lead: "Leave your details and our team will reply within 24 hours.",
      name: "Full name",
      email: "Email",
      store: "Company / store URL",
      service: "Primary service",
      volume: "Monthly order volume",
      phone: "Phone (optional)",
      markets: "Ship-to markets",
      message: "Your needs (optional)",
      next: "Continue",
      back: "Back",
      submit: "Send request",
      sending: "Sending…",
      required: "Please fill in every field marked *.",
      captcha: "Please complete the verification.",
      fail: "Could not send, please try again in a few minutes.",
      done: "Thank you! TH Group will contact you within 24 hours.",
      close: "Close",
      consent: "By submitting, you agree that TH Group may process your data to contact you.",
    },
  }[lang];

  var SERVICES = [
    ["fulfill", "Fulfillment / POD"],
    ["express", "International Express"],
    ["warehouse", "US 3PL Warehouse"],
    ["dropship", "Dropship / TH Group Order"],
  ];
  var BANDS = [
    ["<100", "Under 100"],
    ["100_499", "100–499"],
    ["500_1999", "500–1,999"],
    ["2000_plus", "2,000+"],
  ];
  var MARKETS = [
    ["US", "US"],
    ["EU_UK", "EU / UK"],
    ["OTHER", "Other"],
  ];

  var CSS =
    "#thg-lead,#thg-lead *{all:revert;box-sizing:border-box}" +
    "#thg-lead{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(15,20,30,.55);padding:16px;font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1a1f2b}" +
    "#thg-lead.thg-open{display:flex}" +
    "#thg-lead .thg-box{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:16px;padding:24px;box-shadow:0 30px 80px -20px rgba(0,0,0,.45)}" +
    "#thg-lead h3{margin:0 0 4px;font-size:20px;font-weight:700}" +
    "#thg-lead p{margin:0 0 14px;color:#5b6475}" +
    "#thg-lead label{display:block;margin:10px 0 4px;font-weight:600;font-size:13px}" +
    "#thg-lead input[type=text],#thg-lead input[type=email],#thg-lead input[type=tel],#thg-lead input[type=url],#thg-lead select,#thg-lead textarea{display:block;width:100%;padding:10px 12px;border:1px solid #d8d3c8;border-radius:10px;font:inherit;background:#fff;color:inherit}" +
    "#thg-lead textarea{min-height:84px;resize:vertical}" +
    "#thg-lead .thg-checks{display:flex;gap:16px;margin-top:6px}" +
    "#thg-lead .thg-checks label{display:inline-flex;align-items:center;gap:6px;margin:0;font-weight:500}" +
    "#thg-lead .thg-row{display:flex;gap:8px;margin-top:16px}" +
    "#thg-lead button{font:inherit;cursor:pointer;border-radius:999px;padding:11px 18px;border:1px solid #d8d3c8;background:#fff;color:inherit}" +
    "#thg-lead .thg-primary{flex:1;border:0;background:hsl(36 45% 42%);color:#fff;font-weight:700}" +
    "#thg-lead .thg-primary[disabled]{opacity:.6;cursor:wait}" +
    "#thg-lead .thg-x{position:absolute;top:10px;right:12px;border:0;padding:4px 10px;font-size:22px;line-height:1;background:none}" +
    "#thg-lead .thg-err{margin-top:10px;color:#b42318;font-weight:600}" +
    "#thg-lead .thg-note{margin:12px 0 0;font-size:11px;text-align:center}" +
    "#thg-lead .thg-step{font-size:12px;color:#5b6475}" +
    "#thg-lead [hidden]{display:none}";

  var root = null;
  var step = 1;
  var widgetId = null;
  var token = siteKey ? "" : "DEV_BYPASS";
  var lastFocus = null;

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function select(id, options) {
    var s = el("select", { id: id, required: "" }, [el("option", { value: "", text: "—" })]);
    options.forEach(function (o) {
      s.appendChild(el("option", { value: o[0], text: o[1] }));
    });
    return s;
  }

  function field(label, input) {
    return el("div", {}, [el("label", { for: input.id, text: label }), input]);
  }

  function $(id) {
    return root.querySelector("#" + id);
  }

  function build() {
    var style = el("style", { text: CSS });
    var markets = el(
      "div",
      { class: "thg-checks" },
      MARKETS.map(function (m) {
        var box = el("input", { type: "checkbox", name: "thg-market", value: m[0] });
        if (m[0] === "US") box.checked = true;
        return el("label", {}, [box, document.createTextNode(m[1])]);
      }),
    );
    var form = el("form", { novalidate: "" }, [
      el("div", { class: "thg-step", id: "thg-stepno", text: "1/2" }),
      el("div", { id: "thg-s1" }, [
        field(T.name + " *", el("input", { id: "thg-name", type: "text", autocomplete: "name" })),
        field(
          T.email + " *",
          el("input", { id: "thg-email", type: "email", autocomplete: "email" }),
        ),
        field(
          T.store + " *",
          el("input", { id: "thg-store", type: "url", placeholder: "https://yourstore.com" }),
        ),
        field(T.service + " *", select("thg-service", SERVICES)),
        field(T.volume + " *", select("thg-volume", BANDS)),
      ]),
      el("div", { id: "thg-s2", hidden: "" }, [
        field(T.phone, el("input", { id: "thg-phone", type: "tel", autocomplete: "tel" })),
        el("div", {}, [el("label", { text: T.markets + " *" }), markets]),
        field(T.message, el("textarea", { id: "thg-msg" })),
        el("div", { id: "thg-captcha" }),
      ]),
      el("div", { class: "thg-err", id: "thg-err", hidden: "" }),
      el("div", { class: "thg-row" }, [
        el("button", { type: "button", id: "thg-back", hidden: "", text: "←" }),
        el("button", { type: "submit", class: "thg-primary", id: "thg-submit", text: T.next }),
      ]),
      el("p", { class: "thg-note", text: T.consent }),
    ]);
    var done = el("div", { id: "thg-done", hidden: "" }, [
      el("p", { text: T.done }),
      el("div", { class: "thg-row" }, [
        el("button", { type: "button", class: "thg-primary", "data-thg-close": "", text: T.close }),
      ]),
    ]);
    var box = el("div", { class: "thg-box", role: "dialog", "aria-modal": "true" }, [
      el("button", {
        type: "button",
        class: "thg-x",
        "data-thg-close": "",
        "aria-label": T.close,
        text: "×",
      }),
      el("h3", { text: T.title }),
      el("p", { text: T.lead }),
      form,
      done,
    ]);
    root = el("div", { id: "thg-lead" }, [style, box]);
    document.body.appendChild(root);

    root.addEventListener("click", function (e) {
      if (e.target === root || e.target.closest("[data-thg-close]")) close();
    });
    $("thg-back").addEventListener("click", function () {
      go(1);
    });
    form.addEventListener("submit", onSubmit);
  }

  function showError(message) {
    var box = $("thg-err");
    box.textContent = message || "";
    box.hidden = !message;
  }

  function go(n) {
    step = n;
    $("thg-s1").hidden = n !== 1;
    $("thg-s2").hidden = n !== 2;
    $("thg-back").hidden = n !== 2;
    $("thg-stepno").textContent = n + "/2";
    $("thg-submit").textContent = n === 1 ? T.next : T.submit;
    showError("");
    if (n === 2) renderCaptcha();
  }

  function renderCaptcha() {
    if (!siteKey || widgetId !== null) return;
    var draw = function () {
      widgetId = window.turnstile.render($("thg-captcha"), {
        sitekey: siteKey,
        callback: function (t) {
          token = t;
        },
        "expired-callback": function () {
          token = "";
        },
        "error-callback": function () {
          token = "";
        },
      });
    };
    if (window.turnstile) return draw();
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = draw;
    document.head.appendChild(s);
  }

  function value(id) {
    return $(id).value.trim();
  }

  function utm() {
    var out = {};
    new URLSearchParams(location.search).forEach(function (v, k) {
      if (k.indexOf("utm_") === 0 && v) out[k] = v.slice(0, 200);
    });
    return Object.keys(out).length ? out : undefined;
  }

  function storeUrl() {
    var raw = value("thg-store");
    return /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
  }

  function onSubmit(e) {
    e.preventDefault();
    if (step === 1) {
      var ok =
        value("thg-name") &&
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value("thg-email")) &&
        value("thg-store").length > 3 &&
        value("thg-service") &&
        value("thg-volume");
      if (!ok) return showError(T.required);
      return go(2);
    }
    var markets = [].map.call(
      root.querySelectorAll("input[name=thg-market]:checked"),
      function (x) {
        return x.value;
      },
    );
    if (!markets.length) return showError(T.required);
    if (!token) return showError(T.captcha);
    var service = value("thg-service");
    var body = {
      name: value("thg-name"),
      email: value("thg-email"),
      company_url: storeUrl(),
      monthly_order_band: value("thg-volume"),
      ship_to_markets: markets,
      phone: value("thg-phone") || null,
      message: value("thg-msg") || null,
      source_page: "landing:" + slug,
      locale: lang,
      utm: utm(),
      primary_service: service,
      service_interests: [service],
      turnstile_token: token,
    };
    var button = $("thg-submit");
    button.disabled = true;
    button.textContent = T.sending;
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (r.ok) return null;
        return r
          .json()
          .then(function (j) {
            return (j && j.error) || T.fail;
          })
          .catch(function () {
            return T.fail;
          });
      })
      .catch(function () {
        return T.fail;
      })
      .then(function (error) {
        button.disabled = false;
        button.textContent = T.submit;
        if (error) {
          if (siteKey && window.turnstile && widgetId !== null) {
            window.turnstile.reset(widgetId);
            token = "";
          }
          return showError(error);
        }
        root.querySelector("form").hidden = true;
        $("thg-done").hidden = false;
      });
  }

  function open() {
    if (!root) build();
    lastFocus = document.activeElement;
    root.querySelector("form").hidden = false;
    $("thg-done").hidden = true;
    go(1);
    root.classList.add("thg-open");
    setTimeout(function () {
      $("thg-name").focus();
    }, 30);
  }

  function close() {
    if (!root) return;
    root.classList.remove("thg-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function trigger(target) {
    if (!target || !target.closest) return null;
    if (root && root.contains(target)) return null;
    return target.closest("[data-consult], a[href^='mailto:' i]");
  }

  // Capture phase on window runs before every listener the page attached to document/body,
  // and stopImmediatePropagation keeps the page's own popup or mailto handler from firing.
  window.addEventListener(
    "click",
    function (e) {
      if (!trigger(e.target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    },
    true,
  );
  window.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || !form.getAttribute || (root && root.contains(form))) return;
      if (!/^mailto:/i.test(form.getAttribute("action") || "")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    },
    true,
  );
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && root && root.classList.contains("thg-open")) close();
  });

  // A deep link to the consult form: clear the hash NOW (this script runs before the page's
  // scripts, which may open their own popup for it) and open ours once the body exists.
  if (OPEN_HASHES.indexOf(location.hash) >= 0) {
    history.replaceState(null, "", location.pathname + location.search);
    document.addEventListener("DOMContentLoaded", open);
  }
  window.THGLead = { open: open, close: close };
})();
