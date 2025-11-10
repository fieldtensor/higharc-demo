import React from "react";
import { Graph, GraphRenderer, DEFAULT_VERTEX_COUNT } from "./graph";
import { parseGraphData } from "./util";

type ThemeName = "light" | "dark";
type ThemeMode = ThemeName | "system";

const getSystemTheme = (): ThemeName =>
{
  if( typeof window === "undefined" )
    return "dark";

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const App = () =>
{
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef(
    new GraphRenderer(Graph.randomizedWithVertexCount(DEFAULT_VERTEX_COUNT))
  );
  const renderGraphRef = React.useRef<(() => void) | null>(null);
  const [jsonText, setJsonText] = React.useState("");
  const [jsonError, setJsonError] = React.useState<string | null>(null);
  const [systemTheme, setSystemTheme] = React.useState<ThemeName>(() => getSystemTheme());
  const [themeMode, setThemeMode] = React.useState<ThemeMode>("system");
  const activeTheme = themeMode === "system" ? systemTheme : themeMode;

  const updateJsonFromGraph = React.useCallback(
    () =>
    {
      const renderer = rendererRef.current;

      if( ! renderer )
        return;

      const serialized = renderer.graph.serialize();
      setJsonText(JSON.stringify(serialized, null, 2));
    },
    []
  );

  React.useEffect(
    () =>
    {
      if( typeof window === "undefined" )
        return;

      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const renderer = rendererRef.current;

      if( ! canvas || ! context || ! renderer )
        return;

      const renderGraph = () =>
      {
        const rect = canvas.parentElement?.getBoundingClientRect();
        const width = rect ? rect.width : window.innerWidth;
        const height = rect ? rect.height : window.innerHeight;
        const dpr = window.devicePixelRatio || 1;

        const targetWidth = Math.round(width * dpr);
        const targetHeight = Math.round(height * dpr);

        if( canvas.width !== targetWidth || canvas.height !== targetHeight )
        {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderer.render(context, width, height);
      };
      renderGraphRef.current = renderGraph;

      const handleResize = () => renderGraph();

      const handlePointerMove = (event: PointerEvent) =>
      {
        const rect = canvas.getBoundingClientRect();

        const relativeX = event.clientX - rect.left;
        const relativeY = event.clientY - rect.top;

        const updated = renderer.setHoveredFaceFromScreenPoint(
          relativeX,
          relativeY,
          rect.width,
          rect.height
        );

        if( updated )
          renderGraph();
      };

      const handlePointerLeave = () =>
      {
        if( renderer.clearHoveredFace() )
          renderGraph();
      };

      renderGraph();
      updateJsonFromGraph();

      window.addEventListener("resize", handleResize);
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerleave", handlePointerLeave);

      return () =>
      {
        window.removeEventListener("resize", handleResize);
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerleave", handlePointerLeave);

        if( renderGraphRef.current === renderGraph )
          renderGraphRef.current = null;
      };
    },
    [updateJsonFromGraph]
  );

  React.useEffect(
    () =>
    {
      if( typeof window === "undefined" )
        return;

      const media = window.matchMedia("(prefers-color-scheme: dark)");

      const updateSystemTheme = () => setSystemTheme(media.matches ? "dark" : "light");

      updateSystemTheme();

      if( typeof media.addEventListener === "function" )
        media.addEventListener("change", updateSystemTheme);
      else
        media.addListener(updateSystemTheme);

      return () =>
      {
        if( typeof media.removeEventListener === "function" )
          media.removeEventListener("change", updateSystemTheme);
        else
          media.removeListener(updateSystemTheme);
      };
    },
    []
  );

  React.useEffect(
    () =>
    {
      if( typeof document === "undefined" )
        return;

      document.documentElement.dataset.theme = activeTheme;
    },
    [activeTheme]
  );

  const handleRandomize = () =>
  {
    const renderer = rendererRef.current;

    if( ! renderer )
      return;

    renderer.setGraph(Graph.randomizedWithVertexCount(DEFAULT_VERTEX_COUNT));
    renderer.clearHoveredFace();
    renderGraphRef.current?.();
    updateJsonFromGraph();
  };

  const handleJsonSubmit = () =>
  {
    try
    {
      const parsed = JSON.parse(jsonText);
      const serialized = parseGraphData(parsed);
      const graph = Graph.fromSerialized(serialized);

      const renderer = rendererRef.current;

      if( renderer )
      {
        renderer.setGraph(graph);
        renderer.clearHoveredFace();
        renderGraphRef.current?.();
      }

      setJsonError(null);
    }
    catch(error)
    {
      console.error(error);

      if( error instanceof Error )
        setJsonError(error.message);
      else
        setJsonError("Invalid JSON data");
    }
  };

  const cycleThemeMode = () =>
  {
    setThemeMode(currentMode =>
    {
      if( currentMode === "system" )
        return "light";

      if( currentMode === "light" )
        return "dark";

      return "system";
    });
  };

  const themeButtonLabel =
    themeMode === "system" ? (systemTheme === "dark" ? "System (Dark)" : "System (Light)") :
    themeMode === "dark" ? "Dark" :
    "Light";

  return (
    <div className="app-shell">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="graph-canvas"
          aria-label="Square grid graph rendered on a canvas"
          role="img"
        />
      </div>

      <aside className="control-panel" aria-label="Graph controls">
        <h2 className="control-panel__title">Controls</h2>

        <div className="control-panel__section control-panel__section--compact-next">
          <button type="button" className="control-button" onClick={handleRandomize}>
            Randomize
          </button>
        </div>

        <div className="control-panel__section">
          <button
            type="button"
            className="control-button"
            onClick={cycleThemeMode}
            aria-label="Cycle theme preference"
          >
            Theme:
            {" "}
            {themeButtonLabel}
          </button>
        </div>

        <div className="control-panel__section">
          <label className="control-panel__label" htmlFor="graph-json">
            Graph JSON
          </label>
          <textarea
            id="graph-json"
            className="json-textarea"
            value={jsonText}
            onChange={event => setJsonText(event.target.value)}
            spellCheck={false}
          />
          {jsonError ? (
            <p className="control-panel__error">
              {jsonError}
            </p>
          ) : null}
          <button type="button" className="control-button" onClick={handleJsonSubmit}>
            Set JSON
          </button>
        </div>
      </aside>
    </div>
  );
};

export default App;
