
import os,requests
from telegram import Update,InlineKeyboardMarkup,InlineKeyboardButton
from telegram.ext import ApplicationBuilder,CommandHandler,CallbackQueryHandler
from dotenv import load_dotenv

load_dotenv()

TOKEN=os.getenv("BOT_TOKEN")
API=os.getenv("API_URL")
API_KEY=os.getenv("API_KEY")

async def start(update,context):
    kb=[[InlineKeyboardButton("Makan",callback_data="makan")]]
    await update.message.reply_text("Menu",reply_markup=InlineKeyboardMarkup(kb))

async def izin(update,context):
    q=update.callback_query
    await q.answer()
    u=q.from_user

    requests.post(API+"/izin",json={
        "user_id":u.id,
        "nama":u.first_name,
        "alasan":q.data,
        "mess":"MESS_1"
    },headers={"x-api-key":API_KEY})

    await q.message.reply_text("Izin dicatat")

def main():
    app=ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start",start))
    app.add_handler(CallbackQueryHandler(izin))
    app.run_polling()

if __name__=="__main__":
    main()
