import requests

url = "http://api.vibesbot.com.br/ggtec/api/webhook"
body = {
    "invoice_slug": "6wtHnK2KA5",
    "amount": 1300,
    "paid_amount": 1300,
    "installments": 1,
    "capture_method": "pix",
    "transaction_nsu": "f1e80fa2-2514-4d61-a39b-6d4c9b186da2",
    "order_nsu": "QA57J3UZ",
    "receipt_url": "https://recibo.infinitepay.io/f1e80fa2-2514-4d61-a39b-6d4c9b186da2",
    "items": [
        {"quantity": 3, "price": 100, "description": "zombie"},
        {"quantity": 2, "price": 500, "description": "zombie2"}
    ]
}

resp = requests.post(url, json=body, timeout=15)
print("Status:", resp.status_code)
print("Body:", resp.text)