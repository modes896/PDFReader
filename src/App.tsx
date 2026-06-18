import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Minus,
  Plus,
  Search,
  Sparkles
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

type PdfDocument = Awaited<
  ReturnType<typeof pdfjsLib.getDocument>["promise"]
>;

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || "Untitled PDF";
}

export default function App() {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [fileName, setFileName] = useState("No document opened");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.15);
  const [loading, setLoading] = useState(false);

  async function openPdf() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });

    if (!selected || Array.isArray(selected)) return;

    setLoading(true);

    try {
      const bytes = await readFile(selected);
      const document = await pdfjsLib.getDocument({ data: bytes }).promise;

      setPdf(document);
      setFileName(getFileName(selected));
      setPageCount(document.numPages);
      setCurrentPage(1);
    } catch (error) {
      console.error("Failed to open PDF:", error);
    } finally {
      setLoading(false);
    }
  }

  function goToPage(page: number) {
    if (!pdf) return;

    const next = Math.min(Math.max(page, 1), pageCount);
    setCurrentPage(next);

    document
      .getElementById(`page-${next}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function zoomIn() {
    setZoom((z) => Math.min(z + 0.15, 3));
  }

  function zoomOut() {
    setZoom((z) => Math.max(z - 0.15, 0.5));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openPdf();
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "+") {
        event.preventDefault();
        zoomIn();
      }

      if ((event.metaKey || event.ctrlKey) && event.key === "-") {
        event.preventDefault();
        zoomOut();
      }

      if (event.key === "ArrowRight") {
        goToPage(currentPage + 1);
      }

      if (event.key === "ArrowLeft") {
        goToPage(currentPage - 1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentPage, pageCount, pdf]);

  const pageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount]
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon">
            <Sparkles size={20} />
          </div>
          <div>
            <h1>Fantastic PDF</h1>
            <p>macOS reader</p>
          </div>
        </div>

        <button className="primaryButton" onClick={openPdf}>
          <FolderOpen size={18} />
          Open PDF
        </button>

        <div className="sideSection">
          <div className="sideTitle">Document</div>
          <div className="fileCard">
            <FileText size={18} />
            <span>{fileName}</span>
          </div>
        </div>

        <div className="sideSection">
          <div className="sideTitle">Pages</div>

          <div className="thumbnails">
            {pdf ? (
              pageNumbers.map((page) => (
                <button
                  key={page}
                  className={
                    page === currentPage
                      ? "thumbnail activeThumbnail"
                      : "thumbnail"
                  }
                  onClick={() => goToPage(page)}
                >
                  <PdfThumbnail pdf={pdf} pageNumber={page} />
                  <span>{page}</span>
                </button>
              ))
            ) : (
              <div className="emptyThumbs">
                Open a PDF to see thumbnails here.
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="toolbar">
          <div className="searchBox">
            <Search size={16} />
            <input placeholder="Search coming soon..." disabled />
          </div>

          <div className="toolbarGroup">
            <button onClick={() => goToPage(currentPage - 1)} disabled={!pdf}>
              <ChevronLeft size={18} />
            </button>

            <div className="pageBadge">
              {pdf ? `${currentPage} / ${pageCount}` : "— / —"}
            </div>

            <button onClick={() => goToPage(currentPage + 1)} disabled={!pdf}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="toolbarGroup">
            <button onClick={zoomOut} disabled={!pdf}>
              <Minus size={18} />
            </button>

            <div className="zoomBadge">{Math.round(zoom * 100)}%</div>

            <button onClick={zoomIn} disabled={!pdf}>
              <Plus size={18} />
            </button>
          </div>
        </header>

        <section className="viewer">
          {loading && <div className="hero">Loading PDF...</div>}

          {!loading && !pdf && (
            <div className="hero">
              <div className="heroIcon">
                <FileText size={48} />
              </div>
              <h2>Open your PDF</h2>
              <p>
                Use <strong>⌘O</strong> or the Open PDF button to start reading.
              </p>
              <button className="primaryButton heroButton" onClick={openPdf}>
                <FolderOpen size={18} />
                Choose PDF
              </button>
            </div>
          )}

          {!loading &&
            pdf &&
            pageNumbers.map((page) => (
              <PdfPage
                key={page}
                pdf={pdf}
                pageNumber={page}
                zoom={zoom}
                onVisible={setCurrentPage}
              />
            ))}
        </section>
      </main>
    </div>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  zoom,
  onVisible
}: {
  pdf: PdfDocument;
  pageNumber: number;
  zoom: number;
  onVisible: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });

      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const transform =
        outputScale !== 1
          ? [outputScale, 0, 0, outputScale, 0, 0]
          : undefined;

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform
      }).promise;
    }

    renderPage();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, zoom]);

  useEffect(() => {
    const element = document.getElementById(`page-${pageNumber}`);
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(pageNumber);
        }
      },
      { threshold: 0.55 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [pageNumber, onVisible]);

  return (
    <div className="pageWrap" id={`page-${pageNumber}`}>
      <div className="pageLabel">Page {pageNumber}</div>
      <canvas ref={canvasRef} className="pdfCanvas" />
    </div>
  );
}

function PdfThumbnail({
  pdf,
  pageNumber
}: {
  pdf: PdfDocument;
  pageNumber: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderThumbnail() {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.18 });

      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvas,
        canvasContext: context,
        viewport
      }).promise;
    }

    renderThumbnail();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return <canvas ref={canvasRef} className="thumbCanvas" />;
}