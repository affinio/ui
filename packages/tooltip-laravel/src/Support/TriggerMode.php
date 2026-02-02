<?php

namespace Affino\Tooltip\Laravel\Support;

final class TriggerMode
{
    public const HOVER = 'hover';
    public const FOCUS = 'focus';
    public const HOVER_FOCUS = 'hover-focus';
    public const CLICK = 'click';
    public const MANUAL = 'manual';

    public const DEFAULT = self::HOVER_FOCUS;

    /**
     * @var array<string>
     */
    private const ALLOWED = [
        self::HOVER,
        self::FOCUS,
        self::HOVER_FOCUS,
        self::CLICK,
        self::MANUAL,
    ];

    private function __construct()
    {
    }

    public static function normalize(?string $value): string
    {
        if ($value === null) {
            return self::DEFAULT;
        }

        $candidate = strtolower($value);

        return in_array($candidate, self::ALLOWED, true) ? $candidate : self::DEFAULT;
    }
}
