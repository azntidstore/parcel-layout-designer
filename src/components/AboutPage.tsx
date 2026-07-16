import React, { useState, useEffect } from "react";
import { 
  Youtube, 
  ArrowLeft, 
  Shield, 
  Award, 
  Sparkles, 
  Compass, 
  CheckCircle2, 
  Globe, 
  Heart,
  BarChart3,
  Smartphone,
  Monitor,
  Tablet,
  MapPin,
  TrendingUp,
  Unlock,
  Lock,
  RefreshCw,
  Users,
  Check
} from "lucide-react";
import { UserGuide } from "./UserGuide";
import { SecretStatsPanel } from "./SecretStatsPanel";

interface AboutPageProps {
  onBack: () => void;
  lang: "ar" | "fr";
}

export function AboutPage({ onBack, lang }: AboutPageProps) {
  const isAr = lang === "ar";
  const [showStats, setShowStats] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [geoInfo, setGeoInfo] = useState<{
    city: string;
    country: string;
    ip: string;
    device: string;
    os: string;
  } | null>(null);
  const [localVisits, setLocalVisits] = useState(1);

  useEffect(() => {
    // Increment local visit counter
    try {
      const visits = localStorage.getItem("cadastral_app_local_visits");
      const nextVisits = visits ? parseInt(visits, 10) + 1 : 1;
      localStorage.setItem("cadastral_app_local_visits", nextVisits.toString());
      setLocalVisits(nextVisits);
    } catch (_) {}

    // Detect Device & OS
    const ua = navigator.userAgent;
    let device = "Desktop";
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
      device = "Tablet";
    } else if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) {
      device = "Mobile";
    }
    let os = "Windows";
    if (ua.indexOf("Win") !== -1) os = "Windows";
    else if (ua.indexOf("Mac") !== -1) os = "macOS";
    else if (ua.indexOf("X11") !== -1) os = "UNIX";
    else if (ua.indexOf("Linux") !== -1) os = "Linux";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";

    // Fetch live IP-based location
    const fetchGeo = async () => {
      try {
        setIsLoadingGeo(true);
        const res = await fetch("https://freeipapi.com/api/json");
        if (res.ok) {
          const data = await res.json();
          setGeoInfo({
            city: data.cityName || (isAr ? "الدار البيضاء" : "Casablanca"),
            country: data.countryName || (isAr ? "المغرب" : "Morocco"),
            ip: data.ipAddress || "196.206.x.x",
            device,
            os
          });
        } else {
          throw new Error("Failed to load");
        }
      } catch (err) {
        setGeoInfo({
          city: isAr ? "الرباط" : "Rabat",
          country: isAr ? "المغرب" : "Morocco",
          ip: "196.115.x.x",
          device,
          os
        });
      } finally {
        setIsLoadingGeo(false);
      }
    };

    fetchGeo();
  }, [isAr]);

  const handleVersionClick = () => {
    setClickCount(prev => {
      const next = prev + 1;
      if (next >= 5) {
        setShowStats(true);
        alert(isAr 
          ? "🔓 تم تفعيل لوحة الإحصائيات السرية للموقع بنجاح! ستجدها الآن في أسفل الصفحة." 
          : "🔓 Le tableau des statistiques secrètes du site a été activé avec succès ! Faites défiler vers le bas."
        );
        return 0;
      }
      return next;
    });
  };

  return (
    <div className="flex-1 bg-slate-900 text-slate-100 flex flex-col items-center justify-start py-10 px-4 md:px-8 select-none max-w-5xl mx-auto w-full">
      {/* Header Back Button */}
      <div className={`w-full flex ${isAr ? "justify-end" : "justify-start"} mb-8`}>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold transition text-amber-500 shadow-sm"
        >
          <ArrowLeft className={`w-4 h-4 ${isAr ? "rotate-180" : ""}`} />
          <span>{isAr ? "العودة إلى المحرر" : "Retour à l'éditeur"}</span>
        </button>
      </div>

      {/* Hero Card & Decorative elements */}
      <div className="relative w-full bg-slate-800/80 border border-slate-700 rounded-3xl p-6 md:p-10 shadow-2xl overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -z-10" />

        {/* Brand Section */}
        <div className="flex flex-col items-center text-center">
          <div className="bg-gradient-to-tr from-amber-500 to-rose-500 text-slate-900 p-4 rounded-3xl shadow-xl mb-6">
            <Compass className="w-12 h-12 text-slate-900 stroke-[2.5]" />
          </div>

          <h2 className="text-3xl font-black tracking-widest text-slate-100 uppercase sm:text-4xl bg-gradient-to-r from-amber-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent">
            PARCEL LAYOUT DESIGNER
          </h2>
          <div 
            onClick={handleVersionClick}
            className="mt-2 px-3 py-1 bg-slate-700/60 border border-slate-600 rounded-full text-xs font-bold text-amber-400 tracking-widest cursor-pointer hover:bg-slate-600/80 transition-all active:scale-95 select-none"
          >
            {isAr ? "الإصدار 1.1" : "VERSION 1.1"}
          </div>

          {/* Developer Stamp */}
          <div className="mt-8 p-4 bg-slate-900/50 border border-slate-700/60 rounded-2xl max-w-md w-full">
            <p className="text-stone-400 text-xs uppercase tracking-widest font-mono mb-1">
              {isAr ? "تطوير وإعداد" : "Développé par"}
            </p>
            <p className="text-xl font-extrabold text-indigo-400 tracking-wide">
              Abdellah Ouaddou
            </p>
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-1.5 flex items-center justify-center gap-1">
              <Award className="w-3.5 h-3.5" />
              <span>Ingénieur de Conception Topographique</span>
            </p>
          </div>

          {/* Social YouTube Channel Button */}
          <div className="mt-8 w-full max-w-sm">
            <a
              href="https://www.youtube.com/@TopoGis4you"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 w-full py-4 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-sm rounded-2xl shadow-lg hover:shadow-rose-605/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 duration-150"
            >
              <Youtube className="w-6 h-6 fill-white" />
              <span className="tracking-wide">@TopoGis4you</span>
            </a>
            <p className="text-[11px] text-slate-400 mt-2.5 font-medium leading-relaxed">
              {isAr 
                ? "اشترك في القناة التعليمية TopoGis4you لمتابعة شروحات الهندسة الطبوغرافية ونظم المعلومات الجغرافية"
                : "Abonnez-vous à la chaîne pour des tutoriels experts en topographie et systèmes d'information géographique (SIG)"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Features Outline / Core Capabilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-10">
        {/* Capabilities card */}
        <div className="bg-slate-800/45 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>{isAr ? "وظائف البرنامج الرئيسية" : "Fonctionnalités Clés"}</span>
            </h3>
            <ul className="space-y-3.5 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {isAr 
                    ? "إسقاط طبوغرافي دقيق بأنظمة Lambert بمختلف المناطق المغربية ومستشعرات ذكية."
                    : "Projection cartographique précise (SFC / Maroc Lambert, zones I, II, III, IV)."
                  }
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {isAr 
                    ? "استيراد ملفات الرفع الطبوغرافية بمختلف الصيغ (KML, GPX, DXF, GeoJSON, Excel, CSV)."
                    : "Importation universelle de fichiers de levé topographique (KML, DXF, GeoJSON, Excel...)."
                  }
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {isAr 
                    ? "إنشاء متزامن لجدول نقط الحدود و أطوال الأضلاع والمجاورين بطرق ديناميكية."
                    : "Synchronisation dynamique des coordonnées, gisements, distances et voisins."
                  }
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {isAr 
                    ? "توليد ملف تقني للطباعة الفورية بصفحتين بمقاييس رسم مخصصة وقوالب المحافظة العقارية."
                    : "Production d'un dossier technique d'impression de deux pages avec échelle adaptable."
                  }
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* System parameters and credits card */}
        <div className="bg-slate-800/45 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-indigo-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              <span>{isAr ? "الحقوق والتراخيص" : "Droits & Informations"}</span>
            </h3>
            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <p>
                {isAr
                  ? "تم تصميم هذا المخطط لمساعدة المهندسين الطبوغرافيين في تسريع دمج البيانات ومراجعتها ومطابقتها وتوليد مستندات الطباعة الرسمية."
                  : "Conçu pour assister les ingénieurs géomètres topographes dans l'analyse, la mise en conformité et la génération de livrables professionnels."
                }
              </p>
              <div className="pt-2 border-t border-slate-700/60 space-y-1.5 font-mono text-[11px] text-slate-400">
                <div className="flex justify-between">
                  <span>Logiciel :</span>
                  <span className="text-slate-200">Parcel Layout Designer</span>
                </div>
                <div className="flex justify-between">
                  <span>Auteur :</span>
                  <span className="text-indigo-400 font-semibold">Abdellah Ouaddou</span>
                </div>
                <div className="flex justify-between">
                  <span>Licence :</span>
                  <span className="text-amber-500 font-bold">PRO v1.1</span>
                </div>
                <div className="flex justify-between">
                  <span>Année de version:</span>
                  <span className="text-emerald-400 font-bold">2026</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <span>Made with</span>
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
            <span>for Morocco's Topography & GIS Community</span>
            <button 
              onClick={() => setShowStats(!showStats)} 
              className="text-slate-700 hover:text-indigo-400 p-0.5 rounded transition-colors"
            >
              {showStats ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
            </button>
          </div>
        </div>
      </div>

      {/* Detailed interactive user guide section with optional external browser view */}
      <div className="w-full mt-4">
        <UserGuide lang={lang} />
      </div>

      {/* Hidden analytics dashboard shown under the user guide */}
      {showStats && (
        <div className="w-full mt-6">
          <SecretStatsPanel 
            lang={lang} 
            onClose={() => setShowStats(false)} 
            geoInfo={geoInfo}
            isLoadingGeo={isLoadingGeo}
            localVisits={localVisits}
          />
        </div>
      )}
    </div>
  );
}
