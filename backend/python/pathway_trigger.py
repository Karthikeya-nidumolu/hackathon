import pathway as pw
import requests
import time
import os

# Define the path to the external document you want to monitor
# Create a file named 'external_policy.txt' in the same directory as this script
EXTERNAL_DOC_PATH = "external_policy.txt"
BACKEND_ENDPOINT = "http://localhost:4000/live-update"

def send_update_to_backend(content):
    """Sends the updated file content to the Node.js backend."""
    try:
        response = requests.post(BACKEND_ENDPOINT, json={"content": content})
        print(f"Backend response status: {response.status_code}")
        response.raise_for_status()  # Raise an exception for bad status codes
        print("Update sent to backend successfully.")
    except requests.exceptions.RequestException as e:
        print(f"Error sending update to backend: {e}")

def main():
    if not os.path.exists(EXTERNAL_DOC_PATH):
        print(f"Creating mock external document at {EXTERNAL_DOC_PATH}")
        with open(EXTERNAL_DOC_PATH, "w") as f:
            f.write("Initial policy document content.")
            
    print(f"Starting Pathway to monitor '{EXTERNAL_DOC_PATH}'...")
    print("Edit this file to trigger an update.")
    
    # Use Pathway's file reader to watch for changes
    live_updates = pw.io.fs.read(
        EXTERNAL_DOC_PATH,
        format="text",
        autocommit_duration_ms=500
    )
    
    # Pathway will automatically trigger this function when content changes
    @pw.on_demand
    def process_update(message):
        print(f"\n--- Pathway detected a change! ---")
        send_update_to_backend(message.content)
        return message

    live_updates.process(process_update).run()

if __name__ == "__main__":
    main()