// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

export const threeDee = {
  // Common
  color: "Farbe",
  colorMode: "Farbmodus",
  frame: "Koordinatenrahmen",
  lineWidth: "Linienbreite",
  position: "Position",
  reset: "Zurücksetzen",
  rotation: "Rotation",
  scale: "Skalierung",
  gradient: "Verlauf",
  type: "Typ",
  topic: "Topic",

  // Frame
  age: "Alter",
  axisScale: "Achsenskalierung",
  displayFrame: "Anzeigerahmen",
  displayFrameHelp:
    "Der Koordinatenrahmen, in dem die Kamera platziert wird. Die Kameraposition und -ausrichtung sind relativ zum Ursprung dieses Rahmens.",
  editable: "Bearbeitbar",
  enablePreloading: "Vorladen aktivieren",
  fixed: "Fest",
  followMode: "Verfolgungsmodus",
  followModeHelp:
    "Ändern Sie das Kameraverhalten während der Wiedergabe, um dem Anzeigerahmen zu folgen oder nicht.",
  frameNotFound: "Koordinatenrahmen {{frameId}} nicht gefunden",
  hideAll: "Alle ausblenden",
  historySize: "Verlaufsgröße",
  labels: "Beschriftungen",
  labelSize: "Beschriftungsgröße",
  lineColor: "Linienfarbe",
  noCoordinateFramesFound: "Keine Koordinatenrahmen gefunden",
  parent: "Übergeordnet",
  pose: "Pose",
  rotationOffset: "Rotationsversatz",
  settings: "Einstellungen",
  showAll: "Alle einblenden",
  transforms: "Transformationen",
  translation: "Translation",
  translationOffset: "Translationsversatz",

  // Scene
  background: "Hintergrund",
  debugPicking: "Debug-Auswahl",
  ignoreColladaUpAxis: "COLLADA <up_axis> ignorieren",
  ignoreColladaUpAxisHelp:
    "Das Verhalten von rviz nachahmen, indem das <up_axis>-Tag in COLLADA-Dateien ignoriert wird",
  labelScale: "Beschriftungsskalierung",
  labelScaleHelp: "Skalierungsfaktor, der auf alle Beschriftungen angewendet wird",
  meshUpAxis: "Mesh-Hochachse",
  meshUpAxisHelp:
    'Die Richtung, die beim Laden von Meshes ohne Orientierungsinformationen als "oben" verwendet wird (STL und OBJ)',
  renderStats: "Render-Statistiken",
  scene: "Szene",
  takeEffectAfterReboot: "Diese Einstellung erfordert einen Neustart, um wirksam zu werden",
  YUp: "Y-oben",
  ZUp: "Z-oben",

  // Camera
  distance: "Entfernung",
  far: "Fern",
  fovy: "Y-Achsen-FOV",
  near: "Nah",
  perspective: "Perspektive",
  phi: "Phi",
  planarProjectionFactor: "Planarer Projektionsfaktor",
  syncCamera: "Kamera synchronisieren",
  syncCameraHelp:
    "Die Kamera mit anderen Panels synchronisieren, bei denen diese Einstellung ebenfalls aktiviert ist.",
  target: "Ziel",
  theta: "Theta",
  view: "Ansicht",

  // Topics
  topics: "Topics",

  // Custom layers
  addGrid: "Raster hinzufügen",
  addURDF: "URDF hinzufügen",
  customLayers: "Benutzerdefinierte Ebenen",
  delete: "Löschen",
  divisions: "Unterteilungen",
  grid: "Raster",
  size: "Größe",

  // Image annotations
  imageAnnotations: "Bildannotationen",
  resetView: "Ansicht zurücksetzen",

  // Images
  cameraInfo: "Kamerainformationen",

  // Occupancy Grids
  colorModeCustom: "Benutzerdefiniert",
  colorModeRaw: "Roh",
  colorModeRvizCostmap: "Kostenkarte",
  colorModeRvizMap: "Karte",
  frameLock: "Rahmensperre",
  invalidColor: "Ungültige Farbe",
  maxColor: "Maximalfarbe",
  minColor: "Minimalfarbe",
  unknownColor: "Unbekannte Farbe",

  // Point Extension Utils
  decayTime: "Abklingzeit",
  decayTimeDefaultZeroSeconds: "0 Sekunden",
  pointShape: "Punktform",
  pointShapeCircle: "Kreis",
  pointShapeSquare: "Quadrat",
  pointSize: "Punktgröße",

  // Color Mode
  colorBy: "Einfärben nach",
  colorModeBgraPacked: "BGRA (gepackt)",
  colorModeBgrPacked: "BGR (gepackt)",
  colorModeColorMap: "Farbkarte",
  colorModeFlat: "Einfarbig",
  colorModeRgbaSeparateFields: "RGBA (separate Felder)",
  ColorFieldComputedDistance: "Entfernung (automatisch)",
  flatColor: "Einheitsfarbe",
  opacity: "Deckkraft",
  valueMax: "Maximalwert",
  valueMin: "Minimalwert",

  // Markers
  selectionVariable: "Auswahlvariable",
  selectionVariableHelp:
    "Beim Auswählen eines Markers wird diese globale Variable auf die Marker-ID gesetzt",
  showOutline: "Umriss anzeigen",

  // Poses
  covariance: "Kovarianz",
  covarianceColor: "Kovarianzfarbe",
  poseDisplayTypeArrow: "Pfeil",
  poseDisplayTypeAxis: "Achse",
  poseDisplayTypeLine: "Linie",

  // Publish
  publish: "Veröffentlichen",
  publishTopicHelp: "Das Topic, auf dem veröffentlicht wird",
  publishTypeHelp: "Der Nachrichtentyp, der beim Klicken in der Szene veröffentlicht wird",
  publishTypePoint: "Punkt (geometry_msgs/Point)",
  publishTypePose: "Pose (geometry_msgs/PoseStamped)",
  publishTypePoseEstimate: "Pose-Schätzung (geometry_msgs/PoseWithCovarianceStamped)",
  thetaDeviation: "Theta-Abweichung",
  thetaDeviationHelp: "Die Theta-Standardabweichung, die mit Pose-Schätzungen veröffentlicht wird",
  xDeviation: "X-Abweichung",
  xDeviationHelp: "Die X-Standardabweichung, die mit Pose-Schätzungen veröffentlicht wird",
  yDeviation: "Y-Abweichung",
  yDeviationHelp: "Die Y-Standardabweichung, die mit Pose-Schätzungen veröffentlicht wird",

  // HUD Items and empty states
  noImageTopicsAvailable: "Keine Bild-Topics verfügbar.",
  imageTopicDNE: "Bild-Topic existiert nicht.",
  calibrationTopicDNE: "Kalibrierungs-Topic existiert nicht.",
  imageAndCalibrationDNE: "Bild- und Kalibrierungs-Topics existieren nicht.",
  waitingForCalibrationAndImages: "Warte auf Nachrichten…",
  waitingForCalibration: "Warte auf Kalibrierungsnachrichten…",
  waitingForImages: "Warte auf Bildnachrichten…",
  waitingForSyncAnnotations: "Warte auf synchronisierte Annotationen…",
};
