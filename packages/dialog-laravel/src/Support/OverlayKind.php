<?php

namespace Affino\Dialog\Laravel\Support;

final class OverlayKind
{
    public const DIALOG = 'dialog';
    public const SHEET = 'sheet';

    public static function normalize(string $value): string
    {
        $normalized = strtolower(trim($value));
        return $normalized === self::SHEET ? self::SHEET : self::DIALOG;
    }
}
