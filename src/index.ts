import { generateGCode } from "./gcode";
import "./styles.css";
import { display } from "./previewRender";

const svgInput = document.getElementById('svgFile') as HTMLInputElement;
const button = document.getElementById('customText') as HTMLButtonElement;
const fileNameText = document.getElementById('selectedFileName') as HTMLSpanElement;
const previewImg = document.querySelector('img') as HTMLImageElement;

// Trigger file picker when button is clicked
button.addEventListener('click', () => {
  svgInput.click();
});

// Update UI when file is selected
svgInput.addEventListener('change', () => {
  const file = svgInput.files?.[0];

  if (!file) return;

  // Update filename text
  fileNameText.textContent = file.name;

  // Update preview
  const url = URL.createObjectURL(file);
  previewImg.src = url;

  // Optional: clean up old object URLs later
  previewImg.onload = () => {
    URL.revokeObjectURL(url);
  };
});

const form = document.getElementById("pipeForm");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const svgInput = document.getElementById("svgFile") as HTMLInputElement;
    const pipeODInput = document.getElementById("pipeOD") as HTMLInputElement;
    const xStartInput = document.getElementById("xStart") as HTMLInputElement;
    const svgScaleInput = document.getElementById("svgScale") as HTMLInputElement;
    const rotationInput = document.getElementById("rotation") as HTMLInputElement;
    const samplingResolutionInput = document.getElementById(
      "samplingResolution"
    ) as HTMLInputElement;
    const svgRotationInput = document.getElementById(
      "svgRotation"
    ) as HTMLInputElement;

    let svgFile = svgInput.files?.[0];
    const pipeOD = parseFloat(pipeODInput.value);
    const xStart = parseFloat(xStartInput.value);
    const svgScale = parseFloat(svgScaleInput.value);
    const rotation = parseFloat(rotationInput.value);
    const samplingResolution = parseFloat(samplingResolutionInput.value);
    const svgRotation = parseFloat(svgRotationInput.value);

    if (!svgFile) {
      const response = await fetch('/src/assets/SVMLogo.svg');
      const blob = await response.blob();
      svgFile = new File([blob], 'default.svg', { type: 'image/svg+xml' });
    }

    if (isNaN(pipeOD) || isNaN(xStart)) {
      alert("Please enter valid numeric values.");
      return;
    }

    if (isNaN(svgScale) || svgScale < 0.01) {
      alert("SVG Scaling must be at least .01");
      return;
    }

    if (isNaN(rotation) || rotation < 0 || rotation > 360) {
      alert("Cut rotation must be between 0 and 360 degrees.");
      return;
    }

    if (isNaN(samplingResolution) || samplingResolution < 0.01) {
      alert("Sampling resolution must be at least 0.01.");
      return;
    }

    if (isNaN(svgRotation) || svgRotation < 0 || svgRotation > 360) {
      alert("SVG rotation must be between 0 and 360 degrees.");
      return;
    }

    console.log("SVG File:", svgFile);
    console.log("Pipe OD:", pipeOD);
    console.log("Y Start:", xStart);
    console.log("SVG Scaling:", svgScale);
    console.log("Cut rotation:", rotation);
    console.log("Sampling resolution:", samplingResolution);
    console.log("SVG rotation:", svgRotation);

    const svgText = await readFileAsText(svgFile);
    const svg: Document = parseSvg(svgText);

    const { gcode, gcodeCoords } = generateGCode(
      svg,
      xStart,
      svgScale,
      rotation,
      pipeOD,
      svgRotation,
      samplingResolution
    );

    console.log(gcode);
    const gcodeOutput = document.getElementById("gcode-output") as HTMLTextAreaElement | null;
    if (gcodeOutput) {
      gcodeOutput.value = gcode;
    }
    display(gcodeCoords, pipeOD, xStart);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function parseSvg(svgText: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(svgText, "image/svg+xml");
}
