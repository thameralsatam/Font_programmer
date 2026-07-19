import React from 'react';
import { Type, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Project } from '../types';

interface HomePageProps {
  projects: Project[];
  isCreatingProject: boolean;
  setIsCreatingProject: (val: boolean) => void;
  newProjectName: string;
  setNewProjectName: (val: string) => void;
  createProject: () => void;
  setCurrentProjectId: (id: string | null) => void;
  setConfirmDialog: (dialog: any) => void;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  currentProjectId: string | null;
}

export function HomePage({
  projects,
  isCreatingProject,
  setIsCreatingProject,
  newProjectName,
  setNewProjectName,
  createProject,
  setCurrentProjectId,
  setConfirmDialog,
  setProjects,
  currentProjectId
}: HomePageProps) {
  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-auto min-h-[5rem] py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
            <Type className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900">مُحاذي الخطوط الذكي</h1>
            <p className="text-[10px] text-zinc-500 font-medium">أداة ضبط ومحاذاة الحروف العربية</p>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-8" dir="rtl">
          <h2 className="text-xl font-bold">مشاريع الخطوط</h2>
          <button onClick={() => setIsCreatingProject(true)} className="w-10 h-10 bg-zinc-900 text-white rounded-full font-bold hover:bg-black transition-colors flex items-center justify-center text-xs" title="مشروع جديد">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {isCreatingProject && (
          <div className="mb-8 p-4 sm:p-6 bg-zinc-50 border border-zinc-200 rounded-3xl flex flex-col sm:flex-row items-center gap-3 sm:gap-4" dir="rtl">
            <input 
              type="text" 
              value={newProjectName} 
              onChange={e => setNewProjectName(e.target.value)} 
              placeholder="اسم المشروع..." 
              autoFocus 
              onKeyDown={e => e.key === 'Enter' && createProject()} 
              className="w-full sm:flex-1 bg-white border border-zinc-300 rounded-full px-5 py-2.5 text-sm focus:outline-none focus:border-zinc-500 text-right" 
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button onClick={createProject} className="px-6 py-2.5 bg-zinc-900 text-white rounded-full font-bold text-xs hover:bg-black">إنشاء</button>
              <button onClick={() => { setIsCreatingProject(false); setNewProjectName(''); }} className="px-6 py-2.5 border border-zinc-300 text-zinc-600 rounded-full font-semibold text-xs hover:bg-zinc-50">إلغاء</button>
            </div>
          </div>
        )}
        {!projects.length && !isCreatingProject ? (
          <div className="text-center py-20 bg-zinc-50 border border-zinc-200 rounded-3xl" dir="rtl">
            <Type className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-zinc-700 mb-2">لا توجد مشاريع</h3>
            <p className="text-zinc-500 text-sm">أنشئ مشروعاً جديداً للبدء.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" dir="rtl">
            {projects.map(p => (
              <div key={p.id} onClick={() => setCurrentProjectId(p.id)} className="bg-zinc-50 border border-zinc-200 rounded-3xl p-6 hover:border-zinc-400 transition-all group relative cursor-pointer flex flex-col">
                <button 
                  onClick={e => {
                    e.stopPropagation();
                    setConfirmDialog({
                      isOpen: true,
                      message: 'حذف المشروع نهائياً؟',
                      onConfirm: () => {
                        setProjects(ps => ps.filter(x => x.id !== p.id));
                        if (currentProjectId === p.id) setCurrentProjectId(null);
                      }
                    });
                  }} 
                  className="absolute top-4 left-4 p-2.5 bg-red-50 hover:bg-red-500 text-red-400 hover:text-white border border-red-200 rounded-xl transition-all z-10 flex items-center justify-center"
                  title="حذف"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="w-11 h-11 bg-zinc-200 rounded-2xl flex items-center justify-center mb-4">
                  <Type className="w-5 h-5 text-zinc-600" />
                </div>
                <h3 className="text-lg font-bold mb-2">{p.name}</h3>
                <div className="flex gap-3 text-xs text-zinc-500 mb-6">
                  <span>{p.glyphs.length} محرف</span><span>•</span>
                  <span>{new Date(p.lastModified).toLocaleDateString('ar-SA')}</span>
                </div>
                <div className="mt-auto flex justify-end items-center gap-1.5 text-xs font-semibold text-zinc-600 group-hover:gap-2.5 transition-all">
                  <span>فتح</span><ArrowRight className="w-3.5 h-3.5 rotate-180" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
