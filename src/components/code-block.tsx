"use client";

import { useEffect, useRef, useState } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import { Button } from "@/components/ui/button";
import { Check, Copy, Download } from "lucide-react";

interface CodeBlockProps {
    code: string;
    language?: string;
    className?: string;
    showLineNumbers?: boolean;
    showCopyButton?: boolean;
    onDownload?: () => void;
}

export function CodeBlock({
    code,
    language = "javascript",
    className = "",
    showLineNumbers = false,
    showCopyButton = true,
    onDownload
}: CodeBlockProps) {
    const codeRef = useRef<HTMLElement>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (codeRef.current) {
            Prism.highlightElement(codeRef.current);
        }
    }, [code, language]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={`relative group ${className}`}>
            {/* Language badge and action buttons */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">
                    {language}
                </span>
                <div className="flex items-center gap-1">
                    {showCopyButton && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            title={copied ? "Copied!" : "Copy code"}
                        >
                            {copied ? (
                                <Check className="h-4 w-4 text-chart-2" />
                            ) : (
                                <Copy className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    {onDownload && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onDownload}
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Download file"
                        >
                            <Download className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            <pre className={`${showLineNumbers ? "line-numbers" : ""} bg-[#2d2d2d]! m-0! p-4 rounded-lg overflow-x-auto shadow-inner border border-border`}>
                <code ref={codeRef} className={`language-${language} text-sm! leading-relaxed`}>
                    {code}
                </code>
            </pre>
        </div>
    );
}




