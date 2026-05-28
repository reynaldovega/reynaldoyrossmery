const toast = document.querySelector(".toast");
let toastTimer;
const topbar = document.querySelector(".topbar");

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
    if (isActive) {
      sheet.scrollTop = 0;
    }
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
  updateTopbarShade();
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
const rsvpModal = document.querySelector("[data-rsvp-modal]");
const rsvpForm = document.querySelector("[data-rsvp-form]");
const rsvpStatus = document.querySelector("[data-rsvp-status]");
const companionToggle = document.querySelector("[data-companion-toggle]");
const companionField = document.querySelector("[data-companion-field]");
const shareModal = document.querySelector("[data-share-modal]");
const shareUrlInput = document.querySelector("[data-share-url]");
const shareWhatsapp = document.querySelector("[data-share-whatsapp]");
const shareFacebook = document.querySelector("[data-share-facebook]");
let weddingDb = null;

document.querySelectorAll(".gallery-item img, .story-carousel__slide img").forEach((image) => {
  image.addEventListener("click", () => {
    lightboxImage.src = image.currentSrc || image.src;
    lightboxImage.alt = image.alt;
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
  });
});

document.querySelectorAll("[data-story-carousel]").forEach((carousel) => {
  if (carousel.dataset.carouselReady === "true") {
    return;
  }

  carousel.dataset.carouselReady = "true";
  const slides = Array.from(carousel.querySelectorAll(".story-carousel__slide"));
  const previous = carousel.querySelector("[data-carousel-prev]");
  const next = carousel.querySelector("[data-carousel-next]");
  let currentIndex = 0;

  function showSlide(index) {
    currentIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      slide.classList.toggle("is-current", slideIndex === currentIndex);
    });
  }

  if (previous && next && slides.length) {
    previous.addEventListener("click", () => showSlide(currentIndex - 1));
    next.addEventListener("click", () => showSlide(currentIndex + 1));
  }
});

function updateTopbarShade() {
  if (!topbar) {
    return;
  }

  const activeSheet = document.querySelector("[data-sheet].is-active");
  const heroMedia = activeSheet?.querySelector(".sheet__media, .story-hero");
  let shouldShade = window.scrollY > 24;

  if (heroMedia) {
    const mediaBottom = heroMedia.getBoundingClientRect().bottom;
    shouldShade = mediaBottom <= topbar.offsetHeight + 6;
  }

  topbar.classList.toggle("is-scrolled", shouldShade);
}

window.addEventListener("scroll", updateTopbarShade, { passive: true });
sheets.forEach((sheet) => {
  sheet.addEventListener("scroll", updateTopbarShade, { passive: true });
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
  if (event.key === "Escape" && rsvpModal && !rsvpModal.hidden) {
    closeRsvpModal();
  }
  if (event.key === "Escape" && shareModal && !shareModal.hidden) {
    closeShareModal();
  }
});

function getWeddingDb() {
  if (weddingDb) {
    return weddingDb;
  }

  const config = window.WEDDING_SUPABASE;
  const isConfigured = config?.url && config?.anonKey && !config.url.includes("PEGA_AQUI") && !config.anonKey.includes("PEGA_AQUI");

  if (!isConfigured || !window.supabase) {
    return null;
  }

  weddingDb = window.supabase.createClient(config.url, config.anonKey);
  return weddingDb;
}

function openRsvpModal() {
  if (!rsvpModal) {
    return;
  }

  rsvpModal.hidden = false;
  document.body.classList.add("is-rsvp-open");
  rsvpForm?.querySelector("input")?.focus();
}

function closeRsvpModal() {
  if (!rsvpModal) {
    return;
  }

  rsvpModal.hidden = true;
  document.body.classList.remove("is-rsvp-open");
}

document.querySelectorAll("[data-open-rsvp]").forEach((button) => {
  button.addEventListener("click", openRsvpModal);
});

document.querySelectorAll("[data-close-rsvp]").forEach((button) => {
  button.addEventListener("click", closeRsvpModal);
});

function getShareUrl() {
  return `${window.location.origin}${window.location.pathname}${window.location.hash || "#inicio"}`;
}

function updateShareLinks() {
  const url = getShareUrl();
  const text = `Te comparto la invitacion de Reynaldo y Rossmery: ${url}`;
  if (shareUrlInput) {
    shareUrlInput.value = url;
  }
  if (shareWhatsapp) {
    shareWhatsapp.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  }
  if (shareFacebook) {
    shareFacebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  }
}

function openShareModal() {
  if (!shareModal) {
    return;
  }

  updateShareLinks();
  shareModal.hidden = false;
  document.body.classList.add("is-share-open");
  shareUrlInput?.select();
}

function closeShareModal() {
  if (!shareModal) {
    return;
  }

  shareModal.hidden = true;
  document.body.classList.remove("is-share-open");
}

async function copyShareUrl() {
  const url = getShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast("URL copiada");
  } catch {
    showToast(url);
  }
}

document.querySelectorAll("[data-open-share]").forEach((button) => {
  button.addEventListener("click", openShareModal);
});

document.querySelectorAll("[data-close-share]").forEach((button) => {
  button.addEventListener("click", closeShareModal);
});

document.querySelectorAll("[data-copy-share]").forEach((button) => {
  button.addEventListener("click", copyShareUrl);
});

const musicWidget = document.querySelector("[data-music-widget]");
const musicAudio = document.querySelector("[data-music-audio]");
const musicToggle = document.querySelector("[data-music-toggle]");
const musicVolume = document.querySelector("[data-music-volume]");
const musicStatus = document.querySelector("[data-music-status]");
const musicPercent = document.querySelector("[data-music-percent]");
let musicPanelTimer;

function setMusicPanelOpen(isOpen) {
  if (!musicWidget) {
    return;
  }

  musicWidget.classList.toggle("is-open", isOpen);
  clearTimeout(musicPanelTimer);
  if (isOpen) {
    musicPanelTimer = setTimeout(() => {
      if (!musicWidget.matches(":hover")) {
        musicWidget.classList.remove("is-open");
        musicToggle?.blur();
      }
    }, 1800);
  }
}

function updateMusicUi() {
  if (!musicAudio || !musicToggle || !musicStatus) {
    return;
  }

  const volumeValue = musicVolume ? Number(musicVolume.value) : Math.round(musicAudio.volume * 100);
  const isMuted = musicAudio.muted || volumeValue <= 0;
  const isPlaying = !musicAudio.paused && !isMuted;
  musicToggle.setAttribute("aria-pressed", String(isPlaying));
  musicToggle.setAttribute("aria-label", isPlaying ? "Desactivar musica" : "Activar musica");
  musicStatus.textContent = isPlaying ? "Musica activada" : "Musica desactivada";
  musicWidget?.classList.toggle("is-muted", isMuted || !isPlaying);
  if (musicPercent) {
    musicPercent.textContent = `${Math.max(0, Math.min(100, volumeValue))}%`;
  }
}

if (musicAudio && musicToggle && musicVolume) {
  const initialVolume = 10;
  musicVolume.value = String(initialVolume);
  musicAudio.volume = initialVolume / 100;
  musicAudio.muted = initialVolume <= 0;

  async function startMusicFromPageLoad() {
    if (Number(musicVolume.value) <= 0) {
      updateMusicUi();
      return;
    }

    musicAudio.muted = false;
    try {
      await musicAudio.play();
    } catch {
      updateMusicUi();
      return;
    }
    updateMusicUi();
  }

  musicToggle.addEventListener("click", async () => {
    setMusicPanelOpen(true);

    if (!musicAudio.paused && !musicAudio.muted) {
      musicAudio.pause();
      updateMusicUi();
      return;
    }

    if (Number(musicVolume.value) <= 0) {
      musicVolume.value = "10";
      musicAudio.volume = 0.1;
    }

    musicAudio.muted = false;
    try {
      await musicAudio.play();
    } catch {
      showToast("Toca nuevamente para activar la musica");
    }
    updateMusicUi();
  });

  musicVolume.addEventListener("input", () => {
    setMusicPanelOpen(true);
    const nextVolume = Number(musicVolume.value);
    musicAudio.volume = nextVolume / 100;
    musicAudio.muted = nextVolume <= 0;
    if (nextVolume <= 0 && !musicAudio.paused) {
      musicAudio.pause();
    }
    updateMusicUi();
  });

  musicVolume.addEventListener("change", () => {
    setMusicPanelOpen(false);
    musicVolume.blur();
  });

  musicAudio.addEventListener("play", updateMusicUi);
  musicAudio.addEventListener("pause", updateMusicUi);
  updateMusicUi();
  window.addEventListener("load", startMusicFromPageLoad, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && musicAudio.paused) {
      startMusicFromPageLoad();
    }
  });
}

shareModal?.addEventListener("click", (event) => {
  if (event.target === shareModal) {
    closeShareModal();
  }
});

rsvpModal?.addEventListener("click", (event) => {
  if (event.target === rsvpModal) {
    closeRsvpModal();
  }
});

companionToggle?.addEventListener("change", () => {
  companionField.hidden = !companionToggle.checked;
});

rsvpForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const db = getWeddingDb();
  const formData = new FormData(rsvpForm);
  const submitButton = rsvpForm.querySelector("button[type='submit']");
  const hasCompanion = formData.get("has_companion") === "on";
  const payload = {
    first_name: String(formData.get("first_name") || "").trim(),
    last_name: String(formData.get("last_name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    attendance_confirmed: formData.get("attendance_confirmed") === "on",
    has_companion: hasCompanion,
    companion_name: hasCompanion ? String(formData.get("companion_name") || "").trim() || null : null,
    dietary_restrictions: String(formData.get("dietary_restrictions") || "").trim() || null,
    comments: String(formData.get("comments") || "").trim() || null,
    user_agent: navigator.userAgent,
  };

  if (!db) {
    rsvpStatus.textContent = "Falta conectar Supabase. Revisa supabase-config.js.";
    rsvpStatus.className = "rsvp-form__status is-error";
    return;
  }

  submitButton.disabled = true;
  rsvpStatus.textContent = "Enviando confirmacion...";
  rsvpStatus.className = "rsvp-form__status";

  let { error } = await db.from("rsvp_confirmations").insert(payload);

  if (error && `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.includes("attendance_confirmed")) {
    const { attendance_confirmed: _attendanceConfirmed, ...fallbackPayload } = payload;
    const fallback = await db.from("rsvp_confirmations").insert(fallbackPayload);
    error = fallback.error;
  }

  submitButton.disabled = false;

  if (error) {
    rsvpStatus.textContent = `No se pudo guardar: ${error.message}`;
    rsvpStatus.className = "rsvp-form__status is-error";
    return;
  }

  rsvpStatus.textContent = "Confirmacion enviada. Muchas gracias.";
  rsvpStatus.className = "rsvp-form__status is-success";
  rsvpForm.reset();
  companionField.hidden = true;
  showToast("Asistencia confirmada");
  setTimeout(closeRsvpModal, 1200);
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
updateTopbarShade();
updateCountdown();
setInterval(updateCountdown, 1000);
