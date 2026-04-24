import os
import json
import requests
from datetime import datetime, timedelta

from telegram import (
    Update, InlineKeyboardMarkup, InlineKeyboardButton
)
from telegram.ext import (
    ApplicationBuilder, CommandHandler, CallbackQueryHandler,
    ContextTypes, MessageHandler, filters
)
from dotenv import load_dotenv

load_dotenv()

# ======================
# ENV CONFIG
# ======================
TOKEN = os.getenv("BOT_TOKEN")
API = os.getenv("API_URL")  # https://domain/api
API_KEY = os.getenv("API_KEY")

# SET PER BOT (K39, K42, dst)
MESS = os.getenv("MESS_NAME", "K39")

# ADMIN UTAMA (yang boleh /activate)
ADMIN_IDS = [int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x]

# FILE WHITELIST
GROUP_FILE = "allowed_groups.json"

# DURASI IZIN
DURASI = {
    "makan": 20,
    "merokok": 10,
    "toilet": 5,
    "bab": 15
}

izin_aktif = {}
spam_counter = {}

# ======================
# LOAD & SAVE GROUP
# ======================
def load_groups():
    if os.path.exists(GROUP_FILE):
        with open(GROUP_FILE, "r") as f:
            return json.load(f)
    return []

def save_groups(data):
    with open(GROUP_FILE, "w") as f:
        json.dump(data, f, indent=2)

ALLOWED_GROUPS = load_groups()

# ======================
# HELPER
# ======================
async def is_group(update):
    return update.effective_chat.type in ["group", "supergroup"]

async def is_member(update, context):
    try:
        member = await context.bot.get_chat_member(
            update.effective_chat.id,
            update.effective_user.id
        )
        return member.status in ["member", "administrator", "creator"]
    except:
        return False

def is_allowed_group(chat_id):
    return chat_id in ALLOWED_GROUPS

# ======================
# ACTIVATE BOT
# ======================
async def activate(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group(update):
        return

    user_id = update.effective_user.id
    chat_id = update.effective_chat.id

    if user_id not in ADMIN_IDS:
        return await update.message.reply_text("❌ Kamu bukan admin utama.")

    if chat_id not in ALLOWED_GROUPS:
        ALLOWED_GROUPS.append(chat_id)
        save_groups(ALLOWED_GROUPS)

    await update.message.reply_text(f"✅ Bot aktif di group ini ({MESS})")

# ======================
# MENU
# ======================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group(update):
        return

    chat_id = update.effective_chat.id

    if not is_allowed_group(chat_id):
        return await update.message.reply_text("❌ Bot belum diaktifkan. Gunakan /activate")

    if not await is_member(update, context):
        return

    keyboard = [
        [InlineKeyboardButton("🍽️ Makan", callback_data="izin_makan"),
         InlineKeyboardButton("🚬 Merokok", callback_data="izin_merokok")],
        [InlineKeyboardButton("🚽 Toilet", callback_data="izin_toilet"),
         InlineKeyboardButton("💩 BAB", callback_data="izin_bab")]
    ]

    await update.message.reply_text(
        f"📍 Mess: {MESS}\nPilih izin:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )

# ======================
# IZIN
# ======================
async def handle_izin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not await is_group(update):
        return

    chat_id = query.message.chat.id

    if not is_allowed_group(chat_id):
        return

    if not await is_member(update, context):
        return await query.message.reply_text("❌ Kamu bukan member.")

    user = query.from_user
    uid = str(user.id)

    if uid in izin_aktif:
        return await query.message.reply_text("⚠️ Kamu masih dalam izin.")

    alasan = query.data.replace("izin_", "")
    now = datetime.now()
    kembali = now + timedelta(minutes=DURASI[alasan])

    izin_aktif[uid] = {
        "nama": user.first_name,
        "alasan": alasan,
        "keluar": now,
        "kembali": kembali
    }

    # kirim ke API
    try:
        requests.post(f"{API}/izin", json={
            "user_id": user.id,
            "nama": user.first_name,
            "alasan": alasan,
            "mess": MESS
        }, headers={"x-api-key": API_KEY})
    except:
        pass

    tombol = InlineKeyboardMarkup([
        [InlineKeyboardButton("✅ Saya Sudah Kembali", callback_data=f"in_{uid}")]
    ])

    await query.message.reply_text(
        f"📤 {user.first_name} izin {alasan}\n⏰ {now.strftime('%H:%M')} → {kembali.strftime('%H:%M')}",
        reply_markup=tombol
    )

# ======================
# KEMBALI
# ======================
async def handle_kembali(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not await is_group(update):
        return

    user = query.from_user
    uid = query.data.replace("in_", "")

    # anti spam tombol
    if str(user.id) != uid:
        spam_counter[user.id] = spam_counter.get(user.id, 0) + 1
        return await query.message.reply_text("❌ Tombol bukan milik kamu")

    if uid not in izin_aktif:
        return await query.message.reply_text("❌ Data tidak ditemukan")

    data = izin_aktif.pop(uid)

    # kirim ke API
    try:
        requests.post(f"{API}/kembali", json={
            "user_id": user.id
        }, headers={"x-api-key": API_KEY})
    except:
        pass

    now = datetime.now()
    durasi = now - data["keluar"]

    await query.message.reply_text(
        f"✅ {user.first_name} kembali\n⏱️ {str(durasi).split('.')[0]}"
    )

# ======================
# MAIN
# ======================
def main():
    app = ApplicationBuilder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("activate", activate))

    app.add_handler(CallbackQueryHandler(handle_izin, pattern="^izin_"))
    app.add_handler(CallbackQueryHandler(handle_kembali, pattern="^in_"))

    app.run_polling()

if __name__ == "__main__":
    main()
