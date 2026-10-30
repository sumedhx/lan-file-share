"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const fileInput = document.getElementById("file-input");
    const uploadForm = document.getElementById("upload-form");
    const dropZone = document.getElementById("drop-zone");
    const uploadList = document.getElementById("upload-list");
    const folderPanel = document.getElementById("folder-panel");

    if (!fileInput || !uploadForm || !dropZone || !uploadList) {
        return;
    }

    let activeUploads = 0;
    let reloadPending = false;

    function formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    }

    function showUpload() {
        document.getElementById("upload-panel")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });

        fileInput.click();
    }

    function toggleFolder() {
        if (!folderPanel) return;

        folderPanel.hidden = !folderPanel.hidden;

        if (!folderPanel.hidden) {
            folderPanel.querySelector('input[name="name"]')?.focus();
        }
    }

    document.querySelectorAll('[data-action="upload"]').forEach(button => {
        button.addEventListener("click", showUpload);
    });

    document.querySelectorAll('[data-action="browse"]').forEach(button => {
        button.addEventListener("click", () => fileInput.click());
    });

    document.querySelectorAll('[data-action="folder"]').forEach(button => {
        button.addEventListener("click", toggleFolder);
    });

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length) {
            uploadFiles(Array.from(fileInput.files));
        }
    });

    ["dragenter", "dragover"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            dropZone.classList.remove("dragover");
        });
    });

    dropZone.addEventListener("drop", event => {
        const files = Array.from(event.dataTransfer?.files || []);

        if (files.length) {
            uploadFiles(files);
        }
    });

    function createUploadRow(file) {
        const row = document.createElement("div");
        row.className = "upload-item";

        const top = document.createElement("div");
        top.className = "upload-item-top";

        const name = document.createElement("span");
        name.textContent = `${file.name} · ${formatSize(file.size)}`;

        const status = document.createElement("span");
        status.className = "upload-status";
        status.textContent = "Waiting";

        const progress = document.createElement("progress");
        progress.className = "upload-progress";
        progress.max = 100;
        progress.value = 0;

        top.append(name, status);
        row.append(top, progress);
        uploadList.prepend(row);

        return { row, status, progress };
    }

    function uploadFile(file) {
        return new Promise(resolve => {
            const ui = createUploadRow(file);
            const formData = new FormData();

            formData.append("files", file);
            formData.append(
                "path",
                uploadForm.querySelector('[name="path"]').value
            );

            const xhr = new XMLHttpRequest();
            let settled = false;

            activeUploads++;

            function finish(success) {
                if (settled) return;
                settled = true;
                activeUploads--;

                if (success) {
                    ui.progress.value = 100;
                    ui.status.textContent = "Complete";
                    ui.status.classList.add("success");
                    reloadPending = true;
                } else {
                    ui.status.textContent = "Upload failed";
                    ui.status.classList.add("error");
                }

                resolve(success);
            }

            xhr.open("POST", uploadForm.action);
            xhr.responseType = "text";
            xhr.timeout = 30 * 60 * 1000;

            xhr.upload.onprogress = event => {
                if (event.lengthComputable) {
                    const percent = Math.round(
                        event.loaded / event.total * 100
                    );

                    ui.progress.value = percent;
                    ui.status.textContent = `${percent}%`;
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    finish(true);
                } else {
                    finish(false);
                }
            };

            xhr.onerror = () => finish(false);
            xhr.ontimeout = () => finish(false);
            xhr.onabort = () => finish(false);

            ui.status.textContent = "Uploading…";
            xhr.send(formData);
        });
    }

    async function uploadFiles(files) {
        if (!files.length) return;

        fileInput.value = "";

        const results = await Promise.all(files.map(uploadFile));

        if (reloadPending && activeUploads === 0) {
            const failed = results.some(success => !success);

            if (failed) {
                const notice = document.createElement("p");
                notice.className = "upload-status error";
                notice.textContent =
                    "Some uploads failed. Successful files have been saved.";
                uploadList.prepend(notice);
            }

            // Refresh the directory so successfully uploaded files appear.
            setTimeout(() => window.location.reload(), 1200);
        }
    }
});

const folderInput = document.getElementById("folderInput");

folderInput.addEventListener("change", async () => {
    const files = Array.from(folderInput.files);

    if (!files.length) return;

    const formData = new FormData();

    const currentPath =
        new URLSearchParams(window.location.search).get("path") || "";

    formData.append("path", currentPath);

    for (const file of files) {
        formData.append("files", file, file.webkitRelativePath);
    }

    try {
        const response = await fetch("/upload-folder", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        window.location.reload();
    } catch (error) {
        alert("Folder upload failed: " + error.message);
    } finally {
        folderInput.value = "";
    }
});