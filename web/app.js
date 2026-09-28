import { initializeApp } from "./modules/actions.js";

async function copyTextToClipboard(text) {
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const temp = document.createElement("textarea");
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
    return true;
  }
}

function bindCopyButtons() {
  document.querySelectorAll(".copy-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const targetId = button.dataset.copyTarget;
      const target = document.getElementById(targetId);
      const value = target?.dataset?.fullValue || target?.textContent?.trim();

      if (!value || value === "—") {
        return;
      }

      const copied = await copyTextToClipboard(value);
      if (copied) {
        const previous = button.textContent;
        button.classList.add("copied");
        button.textContent = "✓";
        window.setTimeout(() => {
          button.classList.remove("copied");
          button.textContent = previous;
        }, 800);
      }
    });
  });
}

initializeApp();
bindCopyButtons();
