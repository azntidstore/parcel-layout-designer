import React, { useState } from "react";
import { 
  BookOpen, 
  Search, 
  HelpCircle, 
  CheckCircle2, 
  Globe, 
  Layers, 
  FileText, 
  MapPin, 
  Settings, 
  Printer, 
  ExternalLink,
  Info,
  Camera,
  MousePointer,
  UploadCloud,
  Eye,
  Check,
  ChevronRight,
  ArrowRight,
  Sparkles
} from "lucide-react";

interface UserGuideProps {
  lang: "ar" | "fr";
}

export function UserGuide({ lang: initialLang }: UserGuideProps) {
  const [guideLang, setGuideLang] = useState<"ar" | "fr">(initialLang);
  const [activeTab, setActiveTab] = useState<"visual" | "detailed">("visual");
  const [searchQuery, setSearchQuery] = useState("");

  const isAr = guideLang === "ar";

  const sectionsAr = [
    {
      id: "intro",
      title: "1. مقدمة عن التطبيق",
      icon: <Info className="w-5 h-5 text-indigo-400" />,
      content: "تطبيق Parcel Layout Designer هو منصة سحابية احترافية صممت خصيصاً للمهندسين المساحين الطبوغرافيين (IGT) في المغرب لتوليد وتصميم مخططات التحديد والعمليات الطبوغرافية والملفات التقنية المخصصة لمصالح المحافظة العقارية والمسح العقاري والخرائطية (ANCFCC). يدمج التطبيق بين دقة الحسابات الرياضية الجيوديزية والسرعة الفائقة في عرض الخرائط التفاعلية وإدراج الصور الجوية."
    },
    {
      id: "import",
      title: "2. استيراد الملفات وبيانات الرفع",
      icon: <Layers className="w-5 h-5 text-emerald-400" />,
      content: `يدعم التطبيق استيراد الرفع الطبوغرافي للقطعة الأرضية بمجموعة واسعة من الصيغ:
• ملفات أوتوكاد DXF (نقاط أو مضلعات مغلقة).
• ملفات الأقراص الجيومكانية GeoPackage (.gpkg) و GeoJSON.
• جداول البيانات بصيغ Excel (.xlsx / .xls) و CSV.
• ملفات الحدود الشائعة KML / KMZ.

طريقة الاستيراد:
1. انقر على زر "Choisir un fichier d'arpentage" في اللوحة الجانبية لرفع الملف.
2. سيتعرف التطبيق تلقائياً على نظام الإحداثيات والمضلع الأساسي ويرسمه على الخريطة التفاعلية.
3. يفرغ التطبيق جدول نقاط الحدود تلقائياً مع تسلسلها (P1, P2, P3...) وحساب المسافات الفاصلة وزوايا التوجيه.`
    },
    {
      id: "crs",
      title: "3. ضبط نظام الإحداثيات والمقاييس الجيوديزية",
      icon: <MapPin className="w-5 h-5 text-amber-500" />,
      content: `يتوافق التطبيق بشكل كامل مع البنية الجيوديزية الوطنية للمملكة المغربية:
• نظام مرشيش (Merchich) مع تقسيمات الإسقاط المخروطي المطابق "لامبرت المغرب" (Lambert Zone I, Zone II, Zone III, Zone IV).
• إمكانية تفعيل الإسقاط المباشر وتحديد "Merchich / EPSG:26191" وما يواليها حسب الإقليم الجغرافي للمشروع.
• حساب المساحة المغطاة في مستويين: المساحة المستوية الحسابية (Surface Projetée) والمساحة الحقيقية على الإلبيسويد الجيوديزي بدقة متناهية.`
    },
    {
      id: "edit",
      title: "4. التعديل الديناميكي والمجاورين",
      icon: <Settings className="w-5 h-5 text-blue-400" />,
      content: `في لوحة التحكم في المحرر الرسومي:
• يمكنك مراجعة وتعديل إحداثيات كل نقطة بالخطوط المباشرة (Est / Nord / Altitude).
• إمكانية تحديد أسماء المجاورين (Riverains) لكل ضلع من مضلع القطعة (مثل: ملك خاص، طريق عام، ممر مائي، رقم الرسم العقاري المجاور) لضمان دمجها في المخطط النهائي.
• التحكم الكامل في بيانات رأسية المخطط (رقم الملف التقني Dossier N°، اسم المالك Propriétaire، الإقليم أو العمالة Province، الجماعة الترابية Commune، والمدينة).`
    },
    {
      id: "print",
      title: "5. إرساء وتجهيز مستندات الطباعة الرسمية",
      icon: <Printer className="w-5 h-5 text-rose-500" />,
      content: `ينتج التطبيق ملفاً تقنياً معتمداً ومطابقاً لمعايير المحافظة العقارية يتكون بدقة من صفحتين بحجم A4 في واجهة طباعة موحدة:
• الصفحة الأولى (Document de Renseignements):
  - تتضمن كافة المعلومات الإدارية والمكانية للقطعة في جدول علوي منظم.
  - جدول إحداثيات الرؤوس الرسمي (Est, Nord, Alt) المعتمد.
  - نافذة الصورة الجوية (Orthophotoplan) لدعم المعاينة الفضائية السريعة للحدود.
  - إمكانية إظهار أو إخفاء "سهم المشروع الأحمر" (Flèche Projet) الموجه لمركز القطعة من خلال مربع الاختيار في الأعلى، لتمييز موقع العقار دون تغطية تفاصيل حدوده الأرضية.

• الصفحة الثانية (Plan de Délimitation):
  - تظهر مخطط الرسم الهندسي بمقاييس رسم معيارية (1/1000، 1/500، 1/2500 إلخ) مع مقياس تلقائي ذكي.
  - شبكة الإحداثيات المتراكبة (Graticule) مع تبيين توجيه الشمال الطبوغرافي وسهم اتجاه الرياح.
  - جدول مخصص يربط أضلاع المضلع بالبيانات والمسافات والمجاورين الفعليين.

• دمج خيارات الطباعة (جديد):
  - تم دمج خياري "طباعة 1" (الملف التقني المزدوج A4 + المخطط) و "طباعة 2" (مخطط فريد ذو عنوان وسفح مدمج) في شاشة واحدة. يمكنك الآن التنقل بينهما فوراً بضغطة زر لرؤية المعاينة قبل التصدير.`
    },
    {
      id: "export",
      title: "6. التصدير النهائي وحفظ الملفات",
      icon: <FileText className="w-5 h-5 text-teal-400" />,
      content: `كيفية حفظ المخطط وتصديره:
1. بعد التحقق من مقاييس الرسم وصورة القمر الصناعي ومجاوري القطعة، اضغط على زر "بث الطباعة / Générer le PDF" في شريط الأدوات العلوي.
2. ستفتح نافذة إعدادات الطباعة للمتصفح. ننصح دائماً بتهيئة الإعدادات كالتالي لضمان المظهر المثالي الخالي من الشوائب:
   - تحديد الاتجاه: 'عمودي' (Portrait).
   - تحديد حجم الورق: 'A4' بدقة 100%.
   - تفعيل خيار 'طباعة رسومات الخلفية' (Print Background Graphics) لإظهار ألوان العقود وخريطة الـ Orthophotoplan بوضوح.
   - إلغاء تفعيل خيار 'الهوامش الرأسية والتذييلات' (Headers and Footers) لمنع ظهور روابط المتصفح وتاريخ اليوم في حاشية الورقة.
3. التثبيت كملف PDF رقمي جاهز للإرسال الفوري لخدمات ANCFCC.`
    }
  ];

  const sectionsFr = [
    {
      id: "intro",
      title: "1. Présentation de l'Application",
      icon: <Info className="w-5 h-5 text-indigo-400" />,
      content: "Parcel Layout Designer est une plateforme SaaS hautement professionnelle, spécialement conçue pour les cabinets d'Ingénieurs Géomètres Topographes (IGT) au Maroc pour la production express de plans de délimitation, levés parcellaires et dossiers techniques requis par l'ANCFCC. L'application combine calculs géodésiques de grande précision et mise en page cartographique interactive moderne agrémentée d'extraits d'imagerie aérienne orthorectifiée."
    },
    {
      id: "import",
      title: "2. Importation des Levés & Formats Supports",
      icon: <Layers className="w-5 h-5 text-emerald-400" />,
      content: `L'application gère l'importation de levés de terrain dans une multitude de formats industriels :
• CAO / DAO : Fichiers AutoCAD DXF (points isolés ou polylignes fermées).
• GIS / SIG : Fichiers GeoPackage (.gpkg) et GeoJSON standard.
• Tableurs : Fichiers Microsoft Excel (.xlsx / .xls) et CSV délimités.
• Google Earth : Fichiers parcellaires KML / KMZ.

Procédure :
1. Dans le volet latéral gauche, cliquez sur 'Choisir un fichier d'arpentage'.
2. Le traceur identifie automatiquement les coordonnées, dessine la géométrie et ajuste la vue de la carte.
3. Le tableau des sommets et des tronçons de la parcelle (P1, P2...) est instantanément généré avec calcul automatique des distances et des gisements.`
    },
    {
      id: "crs",
      title: "3. Référencement Géo-Centrique & Métrique",
      icon: <MapPin className="w-5 h-5 text-amber-500" />,
      content: `Le système intègre l'ensemble du canevas géodésique marocain :
• Système géocentrique lié au Datum Elipsoïdal de Merchich.
• Projection Conique Conforme de Lambert en ses 4 zones de couverture nationale (Zone I, Zone II, Zone III, Zone IV).
• Conversion de coordonnées vers les codes de projection officiels (e.g., EPSG:26191 / Lambert Zone I).
• Double quantification de la surface : calcul de la Surface Complète Horizontale (projetée locale) et calcul géodésique précis de l'aire sur l'ellipsoïde terrestre.`
    },
    {
      id: "edit",
      title: "4. Édition Interactive & Déclaration des Riverains",
      icon: <Settings className="w-5 h-5 text-blue-400" />,
      content: `Dans l'interface de l'éditeur cartographique :
• Éditez manuellement les coordonnées X, Y ou l'altitude Z de chaque sommet si nécessaire.
• Spécifiez le nom ou la désignation des Riverains (propriétaires adjacents, routes, oued, domaine public, titre foncier limitrophe) pour chaque côté de la limite afin de compléter la table de gisement.
• Remplissez les données administratives globales : Dossier N°, Province / Préfecture, Commune, Nom du Propriétaire, District et Localité.`
    },
    {
      id: "print",
      title: "5. Production du Livrable Administratif à Double Page",
      icon: <Printer className="w-5 h-5 text-rose-500" />,
      content: `L'outil exporte un modèle de dossier de délimitation de deux pages A4 hautement standardisé dans un panneau d'impression unique :
• Page 1 : Rapport technique officiel & Carnet des Sommets :
  - Bloc d'en-tête dynamique contenant les métadonnées administratives.
  - Tableau de calcul structuré des coordonnées d'arpentage d'une précision infime.
  - Insert de l'extrait d'imagerie aérienne orthorectifiée (Orthophotoplan).
  - Flèche Projet optionnelle : Un commutateur dans la barre supérieure permet d'activer une flèche rouge élégante pointant vers la parcelle depuis le titre « PROJET » pour localiser l'emprise sans compromettre la visibilité de ses contours.

• Page 2 : Plan topographique officiel à l'échelle :
  - Rendu à l'échelle standardisée (1/1000, 1/500, etc.) avec adaptation automatique optimale.
  - Carroyage d'ingénieur (grille de coordonnées d'arpentage) indexé de manière dynamique.
  - Boussole d'orientation moderne, rose des vents et tableau des riverains avec distances réelles.

• Fusion des modes (Nouveau) :
  - Nous avons regroupé l'Impression 1 (A4 + Plan) et l'Impression 2 (Plan seul) sous le même onglet de visualisation. Vous pouvez basculer entre les deux instantanément à l'aide des commutateurs dédiés en haut du panneau.`
    },
    {
      id: "export",
      title: "6. Exportation PDF & Conseils de Print",
      icon: <FileText className="w-5 h-5 text-teal-400" />,
      content: `Pour sauvegarder et exporter le document au format PDF :
1. Assurez-vous d'avoir configuré vos échelles et riverains, puis cliquez sur le bouton rouge 'Générer le PDF / Imprimer' dans la barre de fonctionnalités.
2. Dans la boîte de dialogue système d'impression de votre navigateur, modifiez les paramètres critiques suivants pour un rendu sans bordure parfait :
   - Destination : 'Enregistrer au format PDF'.
   - Orientation : 'Portrait'.
   - Format de papier : 'A4' (Échelle 100%).
   - Cochez 'Graphiques d'arrière-plan' pour forcer l'imagerie aérienne et les contours parcellaires en couleur.
   - Décochez 'En-têtes et pieds de page' pour éliminer les URLs et dates automatiques du navigateur en marge.`
    }
  ];

  // Visual Interactive Step-by-Step Guide with Mock Captures
  const visualSteps = [
    {
      step: "1",
      titleAr: "استيراد ملف الرفع الطبوغرافي",
      titleFr: "Importation du fichier d'arpentage",
      descAr: "اضغط على زر استيراد الملفات باللوحة الجانبية، واختر ملفك (KML, DXF, GPX, CSV, Excel). سيقوم النظام فوراً برسم المضلع وتحديد حدود العقار.",
      descFr: "Cliquez sur 'Choisir un fichier' dans le volet gauche et sélectionnez votre fichier de levé. Le polygone est immédiatement tracé sur la carte.",
      captureType: "upload",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    },
    {
      step: "2",
      titleAr: "ضبط نظام الإحداثيات والمنطقة",
      titleFr: "Sélection de la Zone Lambert Maroc",
      descAr: "اختر نظام الإحداثيات المناسب للمشروع (لامبرت المغرب Zone I, II, III, IV) مع نظام مرشيش للحصول على حساب دقيق فوري للمساحات الجيوديزية.",
      descFr: "Sélectionnez la zone Lambert nationale (Zone I, II, III ou IV) sous le système Merchich pour assurer la conformité métrique et légale de vos plans.",
      captureType: "projection",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20"
    },
    {
      step: "3",
      titleAr: "ملء المعلومات وتحديد المجاورين",
      titleFr: "Données administratives & Riverains",
      descAr: "املأ رقم الملف التقني واسم المالك، وعيّن أسماء المجاورين (ملك خاص، طريق، إلخ) لكل ضلع مباشرة على الخريطة أو في جدول الأضلاع التفاعلي.",
      descFr: "Saisissez les métadonnées (Dossier, Propriétaire, Province) et écrivez directement le nom des riverains sur chaque tronçon de limite foncière.",
      captureType: "details",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20"
    },
    {
      step: "4",
      titleAr: "فتح معاينة الملف التقني للطباعة",
      titleFr: "Visualisation du Dossier de Délimitation",
      descAr: "اضغط على زر 'الملف التقني (طباعة)' الموحد في القائمة العلوية لتنتقل فوراً إلى واجهة تنسيق المستندات الرسمية وإعداد مقاييس الرسم.",
      descFr: "Cliquez sur l'unique bouton 'الملف التقني (طباعة)' dans le menu supérieur pour basculer vers l'atelier de prévisualisation A4 professionnel.",
      captureType: "preview_btn",
      badgeColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
    },
    {
      step: "5",
      titleAr: "التبديل الفوري بين (طباعة 1) و (طباعة 2)",
      titleFr: "Bascule directe (Impression 1 ou 2)",
      descAr: "جديد: من شاشة المعاينة ذاتها، اختر بين 'طباعة 1' (الملف المزدوج: معلومات + المخطط الطبوغرافي) أو 'طباعة 2' (مخطط وحيد بلقطة كاملة مع العنوان والحدود).",
      descFr: "Nouveau : Depuis le même espace, basculez en un clic entre 'Impression 1' (Dossier double A4 + Plan) et 'Impression 2' (Plan parcellaire seul avec surface).",
      captureType: "switcher",
      badgeColor: "bg-pink-500/10 text-pink-400 border-pink-500/20"
    },
    {
      step: "6",
      titleAr: "التصدير النهائي وحفظ الملف PDF",
      titleFr: "Exportation PDF haute fidélité",
      descAr: "اضغط على طباعة، وفي إعدادات المتصفح فعّل خيار 'رسومات الخلفية' وألغِ 'الهوامش الرأسية والتذييلات' لحفظ ملف PDF نظيف ومطابق تماماً.",
      descFr: "Cliquez sur Imprimer. Activez 'Graphiques d'arrière-plan' et masquez les 'En-têtes' du navigateur pour un document final impeccable.",
      captureType: "print_setup",
      badgeColor: "bg-teal-500/10 text-teal-400 border-teal-500/20"
    }
  ];

  const sections = guideLang === "ar" ? sectionsAr : sectionsFr;
  const filteredSections = sections.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    sec.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper function to render a beautiful mock screen capture to visualize steps
  const renderMockCapture = (type: string) => {
    switch (type) {
      case "upload":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-4 flex flex-col justify-center items-center font-sans overflow-hidden">
            {/* Camera badge overlay */}
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-750/80 px-1.5 py-0.5 rounded text-[8px] text-emerald-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
              <span>Capture Screen</span>
            </div>
            {/* Upload Mock Graphic */}
            <div className="w-full max-w-[200px] border-2 border-dashed border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 flex flex-col items-center gap-1 text-center">
              <UploadCloud className="w-6 h-6 text-emerald-400 animate-bounce" />
              <span className="text-[10px] font-bold text-slate-200">levé_terrain_maroc.kml</span>
              <span className="text-[8px] text-slate-500 font-mono">14.2 KB (GeoJSON Polygon)</span>
            </div>
            {/* Cursor pointing */}
            <div className="absolute bottom-2 left-[55%] pointer-events-none animate-pulse">
              <div className="flex items-center gap-1">
                <MousePointer className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="bg-amber-500 text-slate-950 font-bold text-[8px] px-1 rounded-sm shadow-sm select-none">Import</span>
              </div>
            </div>
          </div>
        );
      case "projection":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-4 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-750/80 px-1.5 py-0.5 rounded text-[8px] text-amber-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2.5 h-2.5 text-amber-400" />
              <span>Capture Dropdown</span>
            </div>
            <div className="w-full max-w-[220px] bg-slate-900 border border-slate-750 rounded-lg p-2.5 text-left">
              <span className="text-[8px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Projection Nationale</span>
              <div className="bg-slate-950 border border-amber-500/60 p-2 rounded-md flex justify-between items-center text-[10px] font-bold text-slate-200">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-500" />
                  <span>Maroc Lambert Zone II</span>
                </div>
                <span className="text-[8px] text-amber-400 font-mono">EPSG:26192</span>
              </div>
              <div className="mt-1.5 flex justify-between text-[8px] font-mono text-emerald-400">
                <span>✓ Datum Merchich</span>
                <span>✓ Conique Conforme</span>
              </div>
            </div>
          </div>
        );
      case "details":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-3 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-750/80 px-1.5 py-0.5 rounded text-[8px] text-blue-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2.5 h-2.5 text-blue-400" />
              <span>Capture Form</span>
            </div>
            <div className="w-full space-y-1.5 max-w-[240px]">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-slate-900 p-1.5 rounded border border-slate-800 text-[8px]">
                  <span className="text-slate-500 block mb-0.5 font-bold">PROPRIÉTAIRE</span>
                  <span className="text-slate-200 font-bold truncate block">OULAD ALI BEN JILLALI</span>
                </div>
                <div className="bg-slate-900 p-1.5 rounded border border-slate-800 text-[8px]">
                  <span className="text-slate-500 block mb-0.5 font-bold">DOSSIER N°</span>
                  <span className="text-amber-500 font-bold block font-mono">IGT-2026/894</span>
                </div>
              </div>
              {/* Riverains mini snippet */}
              <div className="bg-slate-900/50 p-1 border border-slate-800 rounded flex justify-between items-center text-[8px]">
                <span className="text-slate-400 font-mono">Côté P1 - P2 :</span>
                <span className="bg-slate-950 text-indigo-400 px-1.5 py-0.5 rounded font-bold border border-slate-750">Route Publique 10m</span>
              </div>
            </div>
          </div>
        );
      case "preview_btn":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-4 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-750/80 px-1.5 py-0.5 rounded text-[8px] text-indigo-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2.5 h-2.5 text-indigo-400" />
              <span>Capture Header</span>
            </div>
            {/* Glow Button Mock */}
            <div className="bg-slate-900 border border-slate-800 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 border-indigo-500/20 relative animate-pulse">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-500 to-indigo-500 rounded-xl blur opacity-30 pointer-events-none" />
              <Printer className="w-4 h-4 text-amber-500" />
              <span className="text-[10.5px] font-black text-slate-100 tracking-wide">الملف التقني (طباعة)</span>
              <MousePointer className="w-3.5 h-3.5 text-amber-400 fill-amber-400 absolute -bottom-1 -right-1" />
            </div>
          </div>
        );
      case "switcher":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-3 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-750/80 px-1.5 py-0.5 rounded text-[8px] text-pink-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2.5 h-2.5 text-pink-400" />
              <span>Capture Switcher</span>
            </div>
            {/* Custom Interactive Switch Graphic */}
            <div className="text-[8px] text-slate-500 uppercase tracking-widest font-black mb-1.5">Options d'affichage</div>
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-850 max-w-[250px] w-full">
              <div className="flex-1 bg-amber-600/90 text-white p-1.5 rounded-lg text-center text-[9px] font-bold shadow-sm select-none">
                طباعة 1 (كامل)
              </div>
              <div className="flex-1 text-slate-400 p-1.5 rounded-lg text-center text-[9px] font-bold hover:text-slate-250 transition select-none">
                طباعة 2 (المخطط فقط)
              </div>
            </div>
            <span className="text-[7.5px] text-slate-500 mt-1">بث سريع بضغطة زر داخل نفس شاشة المعاينة</span>
          </div>
        );
      case "print_setup":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-3 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-2 right-2 bg-slate-900 border border-slate-750/80 px-1.5 py-0.5 rounded text-[8px] text-teal-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2.5 h-2.5 text-teal-400" />
              <span>Capture Options</span>
            </div>
            <div className="w-full max-w-[210px] space-y-1.5 bg-slate-900 p-2.5 rounded-lg text-left">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-emerald-500 flex items-center justify-center text-slate-950">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span className="text-[8.5px] text-slate-200 font-bold">Graphiques d'arrière-plan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded border border-slate-700 bg-slate-950" />
                <span className="text-[8.5px] text-slate-400 font-medium">En-têtes et pieds de page</span>
              </div>
              <div className="pt-1 border-t border-slate-800 flex justify-between items-center text-[8px] font-mono text-slate-500">
                <span>Format: A4</span>
                <span>Échelle: 100%</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Function to download/open a beautifully styled browser document
  const openExternalGuide = () => {
    const isArabic = guideLang === "ar";
    const dir = isArabic ? "rtl" : "ltr";
    const title = isArabic ? "دليل الاستعمال | Parcel Layout Designer" : "Guide d'Utilisation | Parcel Layout Designer";
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="${guideLang}" dir="${dir}">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&family=Noto+Sans+Arabic:wght@400;500;700;900&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: ${isArabic ? "'Noto Sans Arabic', 'Inter', sans-serif" : "'Inter', sans-serif"};
            background-color: #f8fafc;
            color: #1e293b;
            padding: 40px 20px;
            margin: 0;
            line-height: 1.7;
          }
          .container {
            max-width: 900px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            padding: 40px;
            border: 1px solid #e2e8f0;
          }
          .title-area {
            text-align: center;
            border-bottom: 3px double #e2e8f0;
            padding-bottom: 24px;
            margin-bottom: 32px;
          }
          h1 {
            color: #1e3a8a;
            margin: 0;
            font-size: 28px;
            font-weight: 900;
          }
          .subtitle {
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: #64748b;
            margin-top: 8px;
            font-weight: 700;
          }
          .author {
            font-size: 13px;
            color: #4f46e5;
            font-weight: 700;
            margin-top: 6px;
          }
          .visual-step-card {
            background: #fdfbf7;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
            display: flex;
            gap: 20px;
            align-items: flex-start;
          }
          .step-num {
            background: #d97706;
            color: white;
            font-size: 18px;
            font-weight: 900;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .step-desc {
            flex-grow: 1;
          }
          .step-title {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 8px 0;
          }
          .step-text {
            font-size: 14px;
            color: #334155;
            margin: 0;
          }
          .section {
            margin-top: 40px;
            margin-bottom: 28px;
            padding: 20px;
            background: #f1f5f9;
            border-left: 5px solid ${isArabic ? "transparent" : "#4f46e5"};
            border-right: 5px solid ${isArabic ? "#4f46e5" : "transparent"};
            border-radius: 8px;
          }
          h2 {
            font-size: 18px;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 12px;
            font-weight: 800;
          }
          .content {
            font-size: 14.5px;
            white-space: pre-line;
            color: #334155;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            font-weight: 500;
          }
          .button-print {
            display: inline-block;
            margin-bottom: 20px;
            background-color: #4f46e5;
            color: #ffffff;
            padding: 10px 20px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 700;
            font-size: 13px;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
          }
          .button-print:hover {
            background-color: #4338ca;
          }
          @media print {
            body { background: white; padding: 0; }
            .container { box-shadow: none; border: none; padding: 20px; }
            .button-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: center;">
          <button class="button-print" onclick="window.print()">${isArabic ? "طباعة الدليل أو الحفظ كـ PDF" : "Imprimer le Guide / Sauvegarder en PDF"}</button>
        </div>
        <div class="container">
          <div class="title-area">
            <h1>${isArabic ? "دليل الاستعمال المصور - منصة المخططات الطبوغرافية" : "GUIDE D'UTILISATION VISUEL ET DÉTAILLÉ"}</h1>
            <div class="subtitle">Parcel Layout Designer / Pro v1.0</div>
            <div class="author">${isArabic ? "إعداد المهندس: عبد الله واضو" : "Élaboré par : Abdellah Ouaddou"}</div>
          </div>

          <h3>${isArabic ? "المرشد البصري السريع (خطوات الاستعمال):" : "Guide Visuel Rapide (Étapes clés) :"}</h3>
          ${visualSteps.map(step => `
            <div class="visual-step-card">
              <div class="step-num">${step.step}</div>
              <div class="step-desc">
                <div class="step-title">${isArabic ? step.titleAr : step.titleFr}</div>
                <div class="step-text">${isArabic ? step.descAr : step.descFr}</div>
              </div>
            </div>
          `).join("")}

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />

          <h3>${isArabic ? "فصول الدليل المنهجي بالتفصيل:" : "Manuel Détaillé de l'Application :"}</h3>
          ${sections.map(sec => `
            <div class="section">
              <h2>${sec.title}</h2>
              <div class="content">${sec.content}</div>
            </div>
          `).join("")}

          <div class="footer">
            © 2026 Parcel Layout Designer - Abdellah Ouaddou. Tous droits réservés.
          </div>
        </div>
      </body>
      </html>
    `;

    // Try to open with window.open or dynamic blob
    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      // Fallback: alert/create dynamic iframe if popup blocked or standard window open failed
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
      } else {
        alert(isArabic 
          ? "الرجاء السماح للنوافذ المنبثقة لرؤية الدليل في صفحة مستقلة، أو يمكنك معاينته بالكامل مباشرة في التطبيق بالأسفل." 
          : "Veuillez autoriser les fenêtres contextuelles pour afficher le guide externe, ou utilisez la prévisualisation dans l'application ci-dessous."
        );
      }
    }
  };

  return (
    <div className="w-full bg-slate-800/60 border border-slate-700 rounded-3xl p-6 shadow-xl leading-relaxed select-none overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
      
      {/* Upper Menu bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-6 mb-6">
        <div>
          <h3 className="text-lg font-black text-amber-500 flex items-center gap-2 tracking-wide">
            <BookOpen className="w-5 h-5 text-amber-500" />
            <span>{isAr ? "دليل استعمال التطبيق بالتفصيل" : "Guide d'Utilisation Interactif"}</span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isAr 
              ? "دليل تفاعلي مدمج بلقطات توضيحية لتبسيط العمل على المصممين وغير المتخصصين"
              : "Guide visuel avec captures d'écran simulées pour assister les experts et novices"}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Language Switcher */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700/60 text-xs font-bold leading-none">
            <button
              onClick={() => setGuideLang("ar")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                isAr ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setGuideLang("fr")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                !isAr ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Français
            </button>
          </div>

          {/* Browser standalone button */}
          <button
            onClick={openExternalGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-lg shadow transition hover:-translate-y-0.5"
            title={isAr ? "فتح في تبويب مستقل وطباعة" : "Ouvrir dans un nouvel onglet pour impression"}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isAr ? "معاينة في المتصفح" : "Ouvrir dans le navigateur"}</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher: Visual Guide vs Detailed Chapters */}
      <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mb-6 font-bold text-xs">
        <button
          onClick={() => setActiveTab("visual")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
            activeTab === "visual" 
              ? "bg-gradient-to-tr from-amber-600 to-amber-700 text-white shadow" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>{isAr ? "المرشد البصري (لقطات الشاشة)" : "Guide Visuel (Captures)"}</span>
        </button>
        <button
          onClick={() => setActiveTab("detailed")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
            activeTab === "detailed" 
              ? "bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white shadow" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{isAr ? "الفصول المنهجية بالتفصيل" : "Manuel Détaillé"}</span>
        </button>
      </div>

      {activeTab === "visual" ? (
        /* Visual Steps Grid containing Simulated Screenshot Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visualSteps.map((step) => (
            <div 
              key={step.step} 
              className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700/60 transition duration-150 group relative"
            >
              <div>
                {/* Step Header */}
                <div className={`flex items-center gap-2.5 mb-3.5 ${isAr ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
                  <span className={`w-6 h-6 rounded-full border text-xs font-black flex items-center justify-center select-none ${step.badgeColor}`}>
                    {step.step}
                  </span>
                  <h4 className="text-[13px] font-black text-slate-200 group-hover:text-amber-400 transition-colors">
                    {isAr ? step.titleAr : step.titleFr}
                  </h4>
                </div>
                {/* Description text */}
                <p className={`text-[11px] leading-relaxed text-slate-400 mb-5 ${isAr ? "text-right" : "text-left"}`}>
                  {isAr ? step.descAr : step.descFr}
                </p>
              </div>

              {/* Simulated UI Capture/Screenshot Card below */}
              <div className="w-full h-36 mt-auto">
                {renderMockCapture(step.captureType)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Detailed Chapters Tab with Search */
        <>
          {/* Chapters Search Area */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "البحث في فصول دليل الاستعمال..." : "Rechercher dans les sections du manuel..."}
              className={`w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-750 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium ${
                isAr ? "text-right" : "text-left"
              }`}
            />
          </div>

          {/* Chapters/Sections Render Container (In-app interactive view) */}
          <div className={`space-y-4 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar ${isAr ? "text-right" : "text-left"}`}>
            {filteredSections.length > 0 ? (
              filteredSections.map((sec) => (
                <div 
                  key={sec.id} 
                  className="bg-slate-900/65 border border-slate-800 p-5 rounded-2xl hover:border-slate-700/80 transition-all duration-150 group"
                >
                  <div className={`flex items-center gap-3 mb-3 ${isAr ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="p-2 bg-slate-800 rounded-xl group-hover:scale-105 transition-transform duration-150">
                      {sec.icon}
                    </div>
                    <h4 className="text-[13.5px] font-black text-slate-150 group-hover:text-amber-400 transition-colors">
                      {sec.title}
                    </h4>
                  </div>
                  <div 
                    className={`text-[11.5px] leading-relaxed text-slate-350 font-medium whitespace-pre-wrap ${
                      isAr ? "font-serif pr-1" : "font-sans pl-1"
                    }`}
                  >
                    {sec.content}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs font-bold font-mono">
                {isAr ? "لا توجد نتائج مطابقة لبحثك" : "Aucun résultat ne correspond à votre recherche"}
              </div>
            )}
          </div>
        </>
      )}

      {/* Quick notice block for printing instructions */}
      <div className={`mt-6 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3 text-xs text-amber-400 ${
        isAr ? "flex-row-reverse text-right" : "flex-row text-left"
      }`}>
        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <span className="font-extrabold block mb-0.5">{isAr ? "نصيحة هامة للطباعة:" : "Astuce importante pour l'impression :"}</span>
          <span className="text-[10.5px] text-slate-400 font-medium">
            {isAr 
              ? "لتوليد الملف التقني بجودة احترافية كاملة الألوان، تذكر دائماً تفعيل خيار (طباعة رسومات الخلفية - Graphiques d'arrière-plan) وإلغاء خيار الهوامش التلقائية في واجهة الطباعة للمتصفح."
              : "Pour générer le livrable topographique en haute-fidélité couleur, assurez-vous de cocher l'option 'Graphiques d'arrière-plan' et de décocher 'En-têtes et pieds de page' dans les paramètres de votre navigateur."
            }
          </span>
        </div>
      </div>
    </div>
  );
}
