import { DiagramSpec } from "@/lib/types";
import TriangleAngles from "./TriangleAngles";
import TriangleRight from "./TriangleRight";
import TriangleCevian from "./TriangleCevian";
import TriangleSimilarPair from "./TriangleSimilarPair";
import TriangleSides from "./TriangleSides";
import TriangleExteriorAngle from "./TriangleExteriorAngle";
import RectangleShape from "./RectangleShape";
import Parallelogram from "./Parallelogram";
import Trapezoid from "./Trapezoid";
import CircleDiagram from "./CircleDiagram";
import UnitCircleDiagram from "./UnitCircleDiagram";
import VectorPlaneDiagram from "./VectorPlaneDiagram";

export default function DiagramRenderer({ spec }: { spec: DiagramSpec }) {
  const { kind, ...props } = spec;
  switch (kind) {
    case "triangleAngles":
      return <TriangleAngles {...(props as any)} />;
    case "triangleRight":
      return <TriangleRight {...(props as any)} />;
    case "triangleCevian":
      return <TriangleCevian {...(props as any)} />;
    case "triangleSimilarPair":
      return <TriangleSimilarPair {...(props as any)} />;
    case "triangleSides":
      return <TriangleSides {...(props as any)} />;
    case "triangleExteriorAngle":
      return <TriangleExteriorAngle {...(props as any)} />;
    case "rectangle":
      return <RectangleShape {...(props as any)} />;
    case "parallelogram":
      return <Parallelogram {...(props as any)} />;
    case "trapezoid":
      return <Trapezoid {...(props as any)} />;
    case "circle":
      return <CircleDiagram {...(props as any)} />;
    case "unitCircle":
      return <UnitCircleDiagram />;
    case "vectorPlane":
      return <VectorPlaneDiagram {...(props as any)} />;
    default:
      return null;
  }
}
