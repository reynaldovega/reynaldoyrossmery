const toast = document.querySelector(".toast");
let toastTimer;

const sheets = Array.from(document.querySelectorAll("[data-sheet]"));
const sheetLinks = Array.from(document.querySelectorAll("[data-sheet-link]"));
const validSheets = new Set(sheets.map((sheet) => sheet.id));
const sheetAliases = {
  itinerario: "ceremonia",
  confirmar: "confirmacion",
};

function showSheet(id, shouldUpdateHash = true) {
  const requestedId = sheetAliases[id] || id;
  const nextId = validSheets.has(requestedId) ? requestedId : "inicio";

  sheets.forEach((sheet) => {
    const isActive = sheet.id === nextId;
    sheet.classList.toggle("is-active", isActive);
    sheet.hidden = !isActive;
  });

  sheetLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${nextId}`;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (window.location.hash !== `#${nextId}`) {
    if (shouldUpdateHash) {
      history.pushState(null, "", `#${nextId}`);
    } else {
      history.replaceState(null, "", `#${nextId}`);
    }
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

sheetLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href").slice(1);
    if (!validSheets.has(targetId)) {
      return;
    }

    event.preventDefault();
    showSheet(targetId);
  });
});

window.addEventListener("hashchange", () => {
  showSheet(window.location.hash.slice(1), false);
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(value);
      showToast("Dato copiado");
    } catch {
      showToast(value);
    }
  });
});

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxClose = document.querySelector("[data-lightbox-close]");

document.querySelectorAll(".gallery-item img").forEach((image) => {
  image.addEventListener("click", () => {
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
  });
});

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImage.removeAttribute("src");
  lightboxImage.alt = "";
  document.body.classList.remove("is-lightbox-open");
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !lightbox.hidden) {
    closeLightbox();
  }
});

const weddingDate = new Date("2026-09-26T16:00:00-05:00");
const countdownNodes = {
  days: document.querySelector("[data-countdown-days]"),
  hours: document.querySelector("[data-countdown-hours]"),
  minutes: document.querySelector("[data-countdown-minutes]"),
  seconds: document.querySelector("[data-countdown-seconds]"),
};

function updateCountdown() {
  if (!countdownNodes.days) {
    return;
  }

  const distance = Math.max(0, weddingDate.getTime() - Date.now());
  const totalSeconds = Math.floor(distance / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  countdownNodes.days.textContent = String(days).padStart(3, "0");
  countdownNodes.hours.textContent = String(hours).padStart(2, "0");
  countdownNodes.minutes.textContent = String(minutes).padStart(2, "0");
  countdownNodes.seconds.textContent = String(seconds).padStart(2, "0");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

window.showSheet = showSheet;

showSheet(window.location.hash.slice(1) || "inicio", false);
updateCountdown();
setInterval(updateCountdown, 1000);
