export function getGuestId() {
  let guestId = localStorage.getItem("guest_id");

  if (!guestId) {
    guestId = crypto.randomUUID();
    localStorage.setItem("guest_id", guestId);
  }

  return guestId;
}
